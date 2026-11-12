import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as schema from "@/db/schema";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const migrationsDir = path.join(__dirname, "../../../drizzle");
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), "utf-8"));
  }
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("@/db/client", () => ({ db: testDb }));

const { confirmImport, undoImport, getImportContext, listImportBatches, findBatchesByFileHash } =
  await import("./imports");
const { listExpenses } = await import("./expenses");
const { listIncomes } = await import("./incomes");
const { createAsset } = await import("./assets");
const { addAssetSnapshot, listSnapshotsForAsset } = await import("./snapshots");
const { exportDatabase, importDatabase } = await import("./backup");

type ConfirmInput = Parameters<typeof confirmImport>[0];
type Row = ConfirmInput["rows"][number];

function row(position: number, overrides: Partial<Row> = {}): Row {
  return {
    position,
    occurredOn: "2026-10-10",
    kind: "expense",
    amountCents: 1_000,
    categoryId: null,
    note: `Row ${position}`,
    fingerprint: `fp-${position}`,
    ...overrides,
  };
}

function input(overrides: Partial<ConfirmInput> = {}): ConfirmInput {
  return {
    parserId: "cgd-movimentos",
    fileName: "Consulta de movimentos.pdf",
    fileSha256: "abc",
    periodFrom: "2026-10-01",
    periodTo: "2026-10-31",
    closingBalanceCents: 500_000,
    assetId: null,
    linkMode: "none",
    rows: [row(1), row(2, { kind: "income", amountCents: 300_000, occurredOn: "2026-10-05" })],
    ...overrides,
  };
}

function seedCashAsset() {
  return createAsset({
    name: "Conta CGD",
    type: "cash",
    isLiquid: true,
    includeInAllocation: true,
    sleevePercents: { cash: 100, bonds: 0, equities: 0, other: 0 },
    notes: null,
  });
}

beforeEach(() => {
  testDb.delete(schema.expenses).run();
  testDb.delete(schema.incomes).run();
  testDb.delete(schema.importBatches).run();
  testDb.delete(schema.valueSnapshots).run();
  testDb.delete(schema.assets).run();
});

describe("confirmImport", () => {
  it("writes the batch and its rows with fingerprints", () => {
    const result = confirmImport(input());
    expect(result.batch).toMatchObject({ rowCount: 2, linkMode: "none", closingSnapshotId: null });
    expect(listExpenses()[0]).toMatchObject({ importBatchId: result.batch.id, importFingerprint: "fp-1" });
    expect(listIncomes()[0]).toMatchObject({ amountCents: 300_000, importFingerprint: "fp-2" });
    expect(findBatchesByFileHash("abc")).toHaveLength(1);
  });

  it("writes nothing when one row is invalid, naming that row", () => {
    expect(() => confirmImport(input({ rows: [row(1), row(2, { amountCents: 0 })] }))).toThrow(
      expect.objectContaining({ position: 2 }),
    );
    expect(listExpenses()).toHaveLength(0);
    expect(listImportBatches()).toHaveLength(0);
  });

  it("closing mode writes one closing snapshot and leaves rows unlinked", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-09-30", amountCents: 100_000, note: null });
    const result = confirmImport(input({ assetId: asset.id, linkMode: "closing" }));
    expect(result.closing).toBe("written");
    const snapshots = listSnapshotsForAsset(asset.id);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ recordedOn: "2026-10-31", amountCents: 500_000 });
    expect(listExpenses()[0].linkedSnapshotId).toBeNull();
  });

  it("closing mode skips the snapshot when a newer balance exists", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-11-05", amountCents: 100_000, note: null });
    const result = confirmImport(input({ assetId: asset.id, linkMode: "closing" }));
    expect(result.closing).toBe("skipped");
    expect(listSnapshotsForAsset(asset.id)).toHaveLength(1);
  });

  it("per-row mode links rows after the latest balance and leaves older ones unlinked", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-10-07", amountCents: 100_000, note: null });
    const result = confirmImport(input({ assetId: asset.id, linkMode: "per_row" }));
    expect(result.unlinkedCount).toBe(1);
    expect(listIncomes()[0].linkedSnapshotId).toBeNull();
    expect(listExpenses()[0].linkedSnapshotId).not.toBeNull();
    expect(listSnapshotsForAsset(asset.id)[0]).toMatchObject({ recordedOn: "2026-10-10", amountCents: 99_000 });
  });

  it("per-row mode refuses a row that makes the balance negative", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-10-01", amountCents: 500, note: null });
    expect(() =>
      confirmImport(input({ assetId: asset.id, linkMode: "per_row", rows: [row(1)] })),
    ).toThrow(/negative/);
    expect(listExpenses()).toHaveLength(0);
    expect(listSnapshotsForAsset(asset.id)).toHaveLength(1);
  });

  it("ignores the link mode when no account is chosen", () => {
    expect(confirmImport(input({ linkMode: "per_row" })).batch.linkMode).toBe("none");
  });
});

describe("undoImport", () => {
  it("removes exactly the batch's rows and its closing snapshot", () => {
    const asset = seedCashAsset();
    confirmImport(input({ fileSha256: "other", rows: [row(9, { note: "Keep me" })] }));
    const { batch } = confirmImport(input({ assetId: asset.id, linkMode: "closing" }));
    expect(undoImport(batch.id)).toEqual({ ok: true, removed: 2 });
    expect(listExpenses().map((r) => r.note)).toEqual(["Keep me"]);
    expect(listIncomes()).toHaveLength(0);
    expect(listSnapshotsForAsset(asset.id)).toHaveLength(0);
    expect(listImportBatches()).toHaveLength(1);
  });

  it("reverses per-row cash links newest first", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-10-01", amountCents: 100_000, note: null });
    const { batch } = confirmImport(input({ assetId: asset.id, linkMode: "per_row" }));
    expect(listSnapshotsForAsset(asset.id)).toHaveLength(3);
    expect(undoImport(batch.id)).toEqual({ ok: true, removed: 2 });
    expect(listSnapshotsForAsset(asset.id).map((s) => s.amountCents)).toEqual([100_000]);
  });

  it("refuses the whole undo when a linked row is frozen", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-10-01", amountCents: 100_000, note: null });
    const { batch } = confirmImport(input({ assetId: asset.id, linkMode: "per_row" }));
    addAssetSnapshot(asset.id, { recordedOn: "2026-11-01", amountCents: 390_000, note: null });
    const result = undoImport(batch.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer balance on 2026-11-01/);
    expect(listExpenses()).toHaveLength(1);
    expect(listIncomes()).toHaveLength(1);
    expect(listImportBatches()).toHaveLength(1);
  });

  it("reports a missing batch", () => {
    expect(undoImport(999)).toEqual({ ok: false, error: "Import not found." });
  });
});

describe("getImportContext", () => {
  it("returns nearby journal rows with their fingerprints", () => {
    confirmImport(input());
    const context = getImportContext("2026-10-01", "2026-10-31");
    expect(context.existing.map((r) => [r.kind, r.importFingerprint]).sort()).toEqual([
      ["expense", "fp-1"],
      ["income", "fp-2"],
    ]);
    expect(getImportContext("2027-06-01", "2027-06-30").existing).toHaveLength(0);
  });
});

describe("backup round-trip", () => {
  it("restores batches and row links", () => {
    const asset = seedCashAsset();
    const { batch } = confirmImport(input({ assetId: asset.id, linkMode: "closing" }));
    const backup = JSON.parse(JSON.stringify(exportDatabase()));
    expect(importDatabase(backup)).toEqual({ ok: true });
    expect(listImportBatches()[0]).toMatchObject({ id: batch.id, closingSnapshotId: batch.closingSnapshotId });
    expect(listExpenses()[0]).toMatchObject({ importBatchId: batch.id, importFingerprint: "fp-1" });
  });
});
