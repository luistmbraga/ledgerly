import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
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

// Import after mock is set up
const { addAssetSnapshot, deleteSnapshot, updateSnapshot, getSnapshot } = await import(
  "./snapshots"
);
const { createAsset } = await import("./assets");
const { createExpense } = await import("./expenses");
const { createIncome } = await import("./incomes");

function seedAsset(name = "Test Cash") {
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

describe("updateSnapshot", () => {
  it("returns null for missing snapshot", () => {
    const result = updateSnapshot(9999, { recordedOn: "2026-01-01", amountCents: 100, note: null });
    expect(result).toBeNull();
  });

  it("updates the latest snapshot", () => {
    const asset = seedAsset();
    const snap = seedSnapshot(asset.id, "2026-01-01", 10000);
    const updated = updateSnapshot(snap.id, { recordedOn: "2026-01-15", amountCents: 20000, note: "fixed" });
    expect(updated).not.toBeNull();
    expect(updated!.amountCents).toBe(20000);
    expect(updated!.recordedOn).toBe("2026-01-15");
    expect(updated!.note).toBe("fixed");
  });

  it("updates a mid-history snapshot", () => {
    const asset = seedAsset();
    const snap1 = seedSnapshot(asset.id, "2026-01-01", 10000);
    seedSnapshot(asset.id, "2026-02-01", 20000);
    const updated = updateSnapshot(snap1.id, { recordedOn: "2026-01-01", amountCents: 15000, note: null });
    expect(updated!.amountCents).toBe(15000);
  });
});

describe("deleteSnapshot", () => {
  it("returns not_found for missing snapshot", () => {
    const result = deleteSnapshot(9999);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("deletes an unlinked latest snapshot", () => {
    const asset = seedAsset();
    const snap = seedSnapshot(asset.id, "2026-01-01", 10000);
    const result = deleteSnapshot(snap.id);
    expect(result).toEqual({ ok: true });
    expect(getSnapshot(snap.id)).toBeNull();
  });

  it("deletes an unlinked mid-history snapshot", () => {
    const asset = seedAsset();
    const snap1 = seedSnapshot(asset.id, "2026-01-01", 10000);
    seedSnapshot(asset.id, "2026-02-01", 20000);
    const result = deleteSnapshot(snap1.id);
    expect(result).toEqual({ ok: true });
    expect(getSnapshot(snap1.id)).toBeNull();
  });

  it("refuses to delete a snapshot linked to an expense", () => {
    const asset = seedAsset();
    const snap = seedSnapshot(asset.id, "2026-01-01", 10000);
    testDb.update(schema.expenses)
      .set({ linkedSnapshotId: snap.id })
      .run();
    // Directly insert an expense referencing this snapshot
    testDb.insert(schema.expenses).values({
      amountCents: 500,
      occurredOn: "2026-01-01",
      categoryId: null,
      assetId: asset.id,
      linkedSnapshotId: snap.id,
      note: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();
    const result = deleteSnapshot(snap.id);
    expect(result).toEqual({ ok: false, reason: "linked" });
    expect(getSnapshot(snap.id)).not.toBeNull();
  });

  it("refuses to delete a snapshot linked to an income", () => {
    const asset = seedAsset();
    const snap = seedSnapshot(asset.id, "2026-01-01", 10000);
    testDb.insert(schema.incomes).values({
      amountCents: 500,
      occurredOn: "2026-01-01",
      categoryId: null,
      assetId: asset.id,
      linkedSnapshotId: snap.id,
      note: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();
    const result = deleteSnapshot(snap.id);
    expect(result).toEqual({ ok: false, reason: "linked" });
  });

  it("deletes the latest snapshot when it is not linked", () => {
    const asset = seedAsset();
    const snap1 = seedSnapshot(asset.id, "2026-01-01", 10000);
    const snap2 = seedSnapshot(asset.id, "2026-02-01", 20000);
    // Link snap1 (mid-history), leave snap2 unlinked
    testDb.insert(schema.expenses).values({
      amountCents: 500,
      occurredOn: "2026-01-01",
      categoryId: null,
      assetId: asset.id,
      linkedSnapshotId: snap1.id,
      note: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();
    const result = deleteSnapshot(snap2.id);
    expect(result).toEqual({ ok: true });
    expect(getSnapshot(snap2.id)).toBeNull();
    expect(getSnapshot(snap1.id)).not.toBeNull();
  });
});
