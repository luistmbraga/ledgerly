import { eq } from "drizzle-orm";
import { isAllocationBucket, type AllocationBucket } from "@/domain/allocation";
import {
  isAssetType,
  type AssetType,
} from "@/domain/net-worth";
import { db } from "../client";
import { assets, valueSnapshots, type AssetRow } from "../schema";

export type AssetRecord = Omit<AssetRow, "type" | "allocationBucket"> & {
  type: AssetType;
  allocationBucket: AllocationBucket;
};

export type AssetInput = {
  name: string;
  type: AssetType;
  isLiquid: boolean;
  includeInAllocation: boolean;
  allocationBucket: AllocationBucket;
  notes: string | null;
};

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

function assertAssetInput(input: AssetInput): AssetInput {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 200) {
    invalid("Enter a name up to 200 characters.");
  }
  if (!isAssetType(input.type)) {
    invalid("Choose a valid asset type.");
  }
  if (!isAllocationBucket(input.allocationBucket)) {
    invalid("Choose a valid allocation bucket.");
  }
  if (input.notes !== null && input.notes.length > 2000) {
    invalid("Notes must be 2000 characters or fewer.");
  }
  return { ...input, name };
}

function asAsset(row: AssetRow): AssetRecord {
  if (!isAssetType(row.type)) {
    throw new Error(`Unknown asset type: ${row.type}`);
  }
  if (!isAllocationBucket(row.allocationBucket)) {
    throw new Error(`Unknown allocation bucket: ${row.allocationBucket}`);
  }
  return { ...row, type: row.type, allocationBucket: row.allocationBucket };
}

export function listAssets(): AssetRecord[] {
  return db.select().from(assets).all().map(asAsset);
}

export function getAsset(id: number): AssetRecord | undefined {
  const row = db.select().from(assets).where(eq(assets.id, id)).get();
  return row ? asAsset(row) : undefined;
}

export function createAsset(input: AssetInput): AssetRecord {
  const value = assertAssetInput(input);
  const now = new Date().toISOString();
  const row = db
    .insert(assets)
    .values({
      name: value.name,
      type: value.type,
      isLiquid: value.isLiquid,
      includeInAllocation: value.includeInAllocation,
      allocationBucket: value.allocationBucket,
      notes: value.notes,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return asAsset(row);
}

export function updateAsset(
  id: number,
  input: AssetInput,
): AssetRecord | undefined {
  if (!getAsset(id)) return undefined;
  const value = assertAssetInput(input);
  const row = db
    .update(assets)
    .set({
      name: value.name,
      type: value.type,
      isLiquid: value.isLiquid,
      includeInAllocation: value.includeInAllocation,
      allocationBucket: value.allocationBucket,
      notes: value.notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(assets.id, id))
    .returning()
    .get();
  return asAsset(row);
}

export function deleteAsset(id: number): boolean {
  if (!getAsset(id)) return false;
  db.transaction((tx) => {
    tx.delete(valueSnapshots).where(eq(valueSnapshots.assetId, id)).run();
    tx.delete(assets).where(eq(assets.id, id)).run();
  });
  return true;
}
