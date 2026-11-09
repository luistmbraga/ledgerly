import { desc, eq, inArray } from "drizzle-orm";
import { isValidIsoDate } from "../../lib/dates";
import { db } from "../client";
import { assets, expenses, incomes, liabilities, valueSnapshots, type ValueSnapshotRow } from "../schema";

export type SnapshotRecord = ValueSnapshotRow;

export type SnapshotInput = {
  recordedOn: string;
  amountCents: number;
  note: string | null;
};

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

export { isValidIsoDate } from "../../lib/dates";

function assertSnapshotInput(input: SnapshotInput): SnapshotInput {
  if (!isValidIsoDate(input.recordedOn)) {
    invalid("Enter a valid date.");
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
    invalid("Snapshot amount must be zero or greater.");
  }
  if (input.note !== null && input.note.length > 500) {
    invalid("Note must be 500 characters or fewer.");
  }
  return input;
}

export function getLatestSnapshot(assetId: number): SnapshotRecord | null {
  return (
    db
      .select()
      .from(valueSnapshots)
      .where(eq(valueSnapshots.assetId, assetId))
      .orderBy(desc(valueSnapshots.recordedOn), desc(valueSnapshots.id))
      .limit(1)
      .get() ?? null
  );
}

export function getLatestSnapshotForLiability(liabilityId: number): SnapshotRecord | null {
  return (
    db
      .select()
      .from(valueSnapshots)
      .where(eq(valueSnapshots.liabilityId, liabilityId))
      .orderBy(desc(valueSnapshots.recordedOn), desc(valueSnapshots.id))
      .limit(1)
      .get() ?? null
  );
}

export function getLatestSnapshotsByAssetIds(assetIds: number[]): Map<number, SnapshotRecord> {
  if (assetIds.length === 0) return new Map();
  const rows = db
    .select()
    .from(valueSnapshots)
    .where(inArray(valueSnapshots.assetId, assetIds))
    .orderBy(desc(valueSnapshots.recordedOn), desc(valueSnapshots.id))
    .all();
  const result = new Map<number, SnapshotRecord>();
  for (const row of rows) {
    if (row.assetId !== null && !result.has(row.assetId)) {
      result.set(row.assetId, row);
    }
  }
  return result;
}

export function getLatestSnapshotsByLiabilityIds(liabilityIds: number[]): Map<number, SnapshotRecord> {
  if (liabilityIds.length === 0) return new Map();
  const rows = db
    .select()
    .from(valueSnapshots)
    .where(inArray(valueSnapshots.liabilityId, liabilityIds))
    .orderBy(desc(valueSnapshots.recordedOn), desc(valueSnapshots.id))
    .all();
  const result = new Map<number, SnapshotRecord>();
  for (const row of rows) {
    if (row.liabilityId !== null && !result.has(row.liabilityId)) {
      result.set(row.liabilityId, row);
    }
  }
  return result;
}

/** Returns all snapshots for each of the given asset IDs, grouped by assetId, ordered DESC. */
export function listAllSnapshotsByAssetIds(assetIds: number[]): Map<number, SnapshotRecord[]> {
  if (assetIds.length === 0) return new Map();
  const rows = db
    .select()
    .from(valueSnapshots)
    .where(inArray(valueSnapshots.assetId, assetIds))
    .orderBy(desc(valueSnapshots.recordedOn), desc(valueSnapshots.id))
    .all();
  const result = new Map<number, SnapshotRecord[]>();
  for (const row of rows) {
    if (row.assetId === null) continue;
    const list = result.get(row.assetId);
    if (list) {
      list.push(row);
    } else {
      result.set(row.assetId, [row]);
    }
  }
  return result;
}

export function listSnapshotsForAsset(assetId: number): SnapshotRecord[] {
  return db
    .select()
    .from(valueSnapshots)
    .where(eq(valueSnapshots.assetId, assetId))
    .orderBy(desc(valueSnapshots.recordedOn), desc(valueSnapshots.id))
    .all();
}

export function listSnapshotsForLiability(liabilityId: number): SnapshotRecord[] {
  return db
    .select()
    .from(valueSnapshots)
    .where(eq(valueSnapshots.liabilityId, liabilityId))
    .orderBy(desc(valueSnapshots.recordedOn), desc(valueSnapshots.id))
    .all();
}

export function addAssetSnapshot(
  assetId: number,
  input: SnapshotInput,
): SnapshotRecord {
  const asset = db.select().from(assets).where(eq(assets.id, assetId)).get();
  if (!asset) invalid("Asset not found.");
  const value = assertSnapshotInput(input);
  return db
    .insert(valueSnapshots)
    .values({
      assetId,
      liabilityId: null,
      recordedOn: value.recordedOn,
      amountCents: value.amountCents,
      note: value.note,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
}

export function addLiabilitySnapshot(
  liabilityId: number,
  input: SnapshotInput,
): SnapshotRecord {
  const liability = db
    .select()
    .from(liabilities)
    .where(eq(liabilities.id, liabilityId))
    .get();
  if (!liability) invalid("Liability not found.");
  const value = assertSnapshotInput(input);
  return db
    .insert(valueSnapshots)
    .values({
      assetId: null,
      liabilityId,
      recordedOn: value.recordedOn,
      amountCents: value.amountCents,
      note: value.note,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
}

export function getSnapshot(id: number): SnapshotRecord | null {
  return db.select().from(valueSnapshots).where(eq(valueSnapshots.id, id)).get() ?? null;
}

export function updateSnapshot(id: number, input: SnapshotInput): SnapshotRecord | null {
  const existing = getSnapshot(id);
  if (!existing) return null;
  const value = assertSnapshotInput(input);
  return (
    db
      .update(valueSnapshots)
      .set({ recordedOn: value.recordedOn, amountCents: value.amountCents, note: value.note })
      .where(eq(valueSnapshots.id, id))
      .returning()
      .get() ?? null
  );
}

export type DeleteSnapshotResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "linked" };

export function deleteSnapshot(id: number): DeleteSnapshotResult {
  const existing = getSnapshot(id);
  if (!existing) return { ok: false, reason: "not_found" };
  const linkedExpense = db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.linkedSnapshotId, id))
    .get();
  if (linkedExpense) return { ok: false, reason: "linked" };
  const linkedIncome = db
    .select({ id: incomes.id })
    .from(incomes)
    .where(eq(incomes.linkedSnapshotId, id))
    .get();
  if (linkedIncome) return { ok: false, reason: "linked" };
  db.delete(valueSnapshots).where(eq(valueSnapshots.id, id)).run();
  return { ok: true };
}
