"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAllocationBucket } from "@/domain/allocation";
import { isAssetType } from "@/domain/net-worth";
import {
  createAsset,
  deleteAsset,
  updateAsset,
} from "@/db/repositories/assets";
import {
  addAssetSnapshot,
  isValidIsoDate,
} from "@/db/repositories/snapshots";
import { parseMoneyToCents } from "@/lib/money";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function readId(formData: FormData): number | null {
  const raw = String(formData.get("id") ?? formData.get("assetId") ?? "");
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function readNotes(formData: FormData, path: string): string | null {
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 2000) {
    fail(path, "Notes must be 2000 characters or fewer.");
  }
  return notes.length === 0 ? null : notes;
}

function readAssetFields(formData: FormData, path: string) {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0 || name.length > 200) {
    fail(path, "Enter a name up to 200 characters.");
  }
  const type = String(formData.get("type") ?? "");
  if (!isAssetType(type)) {
    fail(path, "Choose a valid asset type.");
  }
  const allocationBucket = String(formData.get("allocationBucket") ?? "");
  if (!isAllocationBucket(allocationBucket)) {
    fail(path, "Choose a valid allocation bucket.");
  }
  return {
    name,
    type,
    isLiquid: formData.get("isLiquid") === "1",
    includeInAllocation: formData.get("includeInAllocation") === "1",
    allocationBucket,
    notes: readNotes(formData, path),
  };
}

export async function createAssetAction(formData: FormData) {
  const input = readAssetFields(formData, "/assets");
  let id: number;
  try {
    id = createAsset(input).id;
  } catch (error) {
    fail(
      "/assets",
      error instanceof Error ? error.message : "Could not save the asset.",
    );
  }
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`/assets/${id}?saved=created`);
}

export async function updateAssetAction(formData: FormData) {
  const id = readId(formData);
  const path = id === null ? "/assets" : `/assets/${id}`;
  if (id === null) fail("/assets", "Asset not found.");
  const input = readAssetFields(formData, path);
  try {
    const updated = updateAsset(id, input);
    if (!updated) fail(path, "Asset not found.");
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Could not save the asset.");
  }
  revalidatePath(path);
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`${path}?saved=updated`);
}

export async function deleteAssetAction(formData: FormData) {
  const id = readId(formData);
  if (id === null || !deleteAsset(id)) fail("/assets", "Asset not found.");
  revalidatePath("/assets");
  revalidatePath("/");
  revalidatePath(`/assets/${id}`);
  redirect("/assets?saved=deleted");
}

export async function addAssetSnapshotAction(formData: FormData) {
  const assetId = Number(String(formData.get("assetId") ?? ""));
  const path = Number.isSafeInteger(assetId) ? `/assets/${assetId}` : "/assets";
  if (!Number.isSafeInteger(assetId) || assetId < 1) fail("/assets", "Asset not found.");

  const parsed = parseMoneyToCents(String(formData.get("amount") ?? ""));
  if (!parsed.ok) fail(path, parsed.error);

  const recordedOn = String(formData.get("recordedOn") ?? "");
  if (!isValidIsoDate(recordedOn)) fail(path, "Enter a valid date.");

  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 500) fail(path, "Note must be 500 characters or fewer.");

  try {
    addAssetSnapshot(assetId, {
      recordedOn,
      amountCents: parsed.cents,
      note: note.length === 0 ? null : note,
    });
  } catch (error) {
    fail(
      path,
      error instanceof Error ? error.message : "Could not add the snapshot.",
    );
  }

  revalidatePath(path);
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot`);
}
