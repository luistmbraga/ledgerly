import { desc, eq } from "drizzle-orm";
import { isValidIsoDate } from "../../lib/dates";
import { db } from "../client";
import { assets, liabilities, valueSnapshots, type ValueSnapshotRow } from "../schema";

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
