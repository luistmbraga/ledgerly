import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as schema from "@/db/schema";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const migrationsDir = path.join(__dirname, "../../../drizzle");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    sqlite.exec(sql);
  }
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("@/db/client", () => ({ db: testDb }));

const { createExpense, updateExpense, deleteExpense, unlinkExpenseCash } = await import("./expenses");
const { createAsset } = await import("./assets");
const { addAssetSnapshot } = await import("./snapshots");

function seedCashAsset(name = "Checking") {
  return createAsset({
    name,
    type: "cash",
    isLiquid: true,
    includeInAllocation: true,
    sleevePercents: { cash: 100, bonds: 0, equities: 0, other: 0 },
    notes: null,
  });
}

function seedSnapshot(assetId: number, recordedOn: string, amountCents: number) {
  return addAssetSnapshot(assetId, { recordedOn, amountCents, note: null });
}

beforeEach(() => {
  testDb.delete(schema.expenses).run();
  testDb.delete(schema.incomes).run();
  testDb.delete(schema.valueSnapshots).run();
  testDb.delete(schema.assets).run();
});

describe("cash-link orchestration: create → link → freeze → unlink → edit", () => {
  it("full scenario: linked expense is frozen after a newer snapshot, unlink restores editability", () => {
    // 1. Create asset with an initial balance
    const asset = seedCashAsset();
    seedSnapshot(asset.id, "2026-01-01", 100_000);

    // 2. Create expense linked to the cash account — creates a snapshot for 2026-01-15
    const expense = createExpense({
      amountCents: 20_000,
      occurredOn: "2026-01-15",
      categoryId: null,
      assetId: asset.id,
      note: "Groceries",
    });
    expect(expense.linkedSnapshotId).not.toBeNull();
    expect(expense.assetId).toBe(asset.id);

    // 3. Add a newer manual snapshot after the linked one — this freezes the expense
    seedSnapshot(asset.id, "2026-02-01", 90_000);

    // 4. Attempt to edit the expense cash fields — should throw a ValidationError (frozen)
    expect(() =>
      updateExpense(expense.id, {
        amountCents: 25_000,          // changed amount
        occurredOn: "2026-01-15",
        categoryId: null,
        assetId: asset.id,
        note: "Groceries (corrected)",
      }),
    ).toThrow(/newer balance/i);

    // 5. Unlink the expense cash reference — clears assetId and linkedSnapshotId
    const unlinked = unlinkExpenseCash(expense.id);
    expect(unlinked).toBe(true);

    // 6. Edit the expense now that it is no longer frozen
    const updated = updateExpense(expense.id, {
      amountCents: 25_000,
      occurredOn: "2026-01-15",
      categoryId: null,
      assetId: null,          // no cash account after unlink
      note: "Groceries (corrected)",
    });
    expect(updated).not.toBeUndefined();
    expect(updated!.amountCents).toBe(25_000);
    expect(updated!.linkedSnapshotId).toBeNull();
    expect(updated!.assetId).toBeNull();
  });

  it("editing non-cash fields on a frozen expense succeeds", () => {
    const asset = seedCashAsset();
    seedSnapshot(asset.id, "2026-01-01", 100_000);
    const expense = createExpense({
      amountCents: 10_000,
      occurredOn: "2026-01-10",
      categoryId: null,
      assetId: asset.id,
      note: null,
    });
    seedSnapshot(asset.id, "2026-02-01", 50_000);

    // Category change only — amount, date, account unchanged — should not throw
    const updated = updateExpense(expense.id, {
      amountCents: 10_000,
      occurredOn: "2026-01-10",
      categoryId: null,
      assetId: asset.id,
      note: "Added note",
    });
    expect(updated).not.toBeUndefined();
    expect(updated!.note).toBe("Added note");
  });

  it("deletes linked snapshot when expense is deleted while link is still latest", () => {
    const asset = seedCashAsset();
    seedSnapshot(asset.id, "2026-01-01", 50_000);
    const expense = createExpense({
      amountCents: 5_000,
      occurredOn: "2026-01-05",
      categoryId: null,
      assetId: asset.id,
      note: null,
    });
    const snapshotId = expense.linkedSnapshotId;
    expect(snapshotId).not.toBeNull();

    deleteExpense(expense.id);

    const remaining = testDb
      .select()
      .from(schema.valueSnapshots)
      .where(eq(schema.valueSnapshots.id, snapshotId!))
      .get();
    expect(remaining).toBeUndefined();
  });
});
