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

const { confirmImport, undoImport, getImportContext, listImportBatches, findBatchesByFileHash, frozenEntryKeys } =
  await import("./imports");
const { listExpenses, getExpense } = await import("./expenses");
const { createTemplate, postDue, listDue } = await import("./recurring");
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
  testDb.delete(schema.importBatchUpdates).run();
  testDb.delete(schema.expenses).run();
  testDb.delete(schema.recurringTemplates).run();
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

describe("confirming recurring entries", () => {
  function postEndesa(assetId: number | null = null) {
    const t = createTemplate({
      kind: "expense",
      amountCents: 4_500,
      amountVaries: true,
      categoryId: null,
      assetId,
      note: "Electricity",
      matchText: "ENDESA",
      cadence: "monthly",
      anchorOn: "2026-10-25",
      endOn: null,
    });
    postDue("2026-10-25", [{ templateId: t.id, period: "2026-10", amountCents: 4_500 }]);
    return listExpenses()[0];
  }

  function reconcile(entryId: number, update: boolean) {
    return {
      position: 7,
      kind: "expense" as const,
      entryId,
      previousAmountCents: 4_500,
      previousOccurredOn: "2026-10-25",
      amountCents: 4_389,
      occurredOn: "2026-10-27",
      fingerprint: "2026-10-27|4389|expense|endesa energia|1",
      differs: true,
      update,
    };
  }

  it("updates the posted entry to the bank amount and date, keeping its template period", () => {
    const entry = postEndesa();
    const result = confirmImport(input({ rows: [row(1)], recurring: [reconcile(entry.id, true)] }));
    expect(result.updatedCount).toBe(1);
    expect(getExpense(entry.id)).toMatchObject({
      amountCents: 4_389,
      occurredOn: "2026-10-27",
      importFingerprint: "2026-10-27|4389|expense|endesa energia|1",
      recurringTemplateId: entry.recurringTemplateId,
      recurringPeriod: "2026-10",
      note: "Electricity",
    });
    expect(listExpenses().filter((e) => e.note === "Electricity")).toHaveLength(1);
    expect(listDue("2026-10-31")).toEqual([]);
  });

  it("only stores the fingerprint when the update is unticked", () => {
    const entry = postEndesa();
    const result = confirmImport(input({ rows: [row(1)], recurring: [reconcile(entry.id, false)] }));
    expect(result.updatedCount).toBe(0);
    expect(getExpense(entry.id)).toMatchObject({ amountCents: 4_500, occurredOn: "2026-10-25" });
    expect(getExpense(entry.id)?.importFingerprint).toBe("2026-10-27|4389|expense|endesa energia|1");
  });

  it("allows a confirm that only updates entries", () => {
    const entry = postEndesa();
    expect(confirmImport(input({ rows: [], recurring: [reconcile(entry.id, true)] })).updatedCount).toBe(1);
    expect(() => confirmImport(input({ rows: [], recurring: [reconcile(entry.id, false)] }))).toThrow(/Select at least one/);
  });

  it("undo restores the posted entry and removes the imported rows", () => {
    const entry = postEndesa();
    const { batch } = confirmImport(input({ rows: [row(1)], recurring: [reconcile(entry.id, true)] }));
    expect(undoImport(batch.id)).toEqual({ ok: true, removed: 1 });
    expect(getExpense(entry.id)).toMatchObject({ amountCents: 4_500, occurredOn: "2026-10-25", importFingerprint: null });
    expect(listExpenses()).toHaveLength(1);
    expect(testDb.select().from(schema.importBatchUpdates).all()).toHaveLength(0);
  });

  it("refuses to update a frozen cash-linked entry and writes nothing", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-10-01", amountCents: 100_000, note: null });
    const entry = postEndesa(asset.id);
    expect(entry.linkedSnapshotId).not.toBeNull();
    addAssetSnapshot(asset.id, { recordedOn: "2026-11-01", amountCents: 90_000, note: null });
    expect(() => confirmImport(input({ rows: [row(1)], recurring: [reconcile(entry.id, true)] }))).toThrow(
      expect.objectContaining({ position: 7 }),
    );
    expect(getExpense(entry.id)).toMatchObject({ amountCents: 4_500, importFingerprint: null });
    expect(listImportBatches()).toHaveLength(0);
  });

  it("reports frozen matched entries for the preview", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-10-01", amountCents: 100_000, note: null });
    const entry = postEndesa(asset.id);
    expect(frozenEntryKeys([{ kind: "expense", entryId: entry.id }]).size).toBe(0);
    addAssetSnapshot(asset.id, { recordedOn: "2026-11-01", amountCents: 90_000, note: null });
    expect([...frozenEntryKeys([{ kind: "expense", entryId: entry.id }])]).toEqual([`expense:${entry.id}`]);
  });

  it("re-importing shows the confirmed entry as already imported", () => {
    const entry = postEndesa();
    confirmImport(input({ rows: [], recurring: [reconcile(entry.id, true)] }));
    const context = getImportContext("2026-10-01", "2026-10-31");
    expect(context.existing.find((e) => e.id === entry.id)?.importFingerprint).toBe(
      "2026-10-27|4389|expense|endesa energia|1",
    );
  });

  it("round-trips import updates through a backup", () => {
    const entry = postEndesa();
    confirmImport(input({ rows: [row(1)], recurring: [reconcile(entry.id, true)] }));
    const backup = JSON.parse(JSON.stringify(exportDatabase()));
    expect(backup.import_batch_updates).toHaveLength(1);
    expect(importDatabase(backup)).toEqual({ ok: true });
    expect(testDb.select().from(schema.importBatchUpdates).all()).toHaveLength(1);
  });
});
