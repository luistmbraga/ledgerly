"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isValidSleevePercents,
  type AllocationPercents,
} from "@/domain/allocation";
import { isAssetType } from "@/domain/net-worth";
import {
  createAsset,
  deleteAsset,
  updateAsset,
} from "@/db/repositories/assets";
import {
  addAssetSnapshot,
  deleteSnapshot,
  getSnapshot,
  isValidIsoDate,
  updateSnapshot,
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
  const sleevePercents = readSleevePercents(formData);
  if (!isValidSleevePercents(sleevePercents)) {
    fail(path, "Allocation percents must be whole numbers that sum to 100.");
  }
  if (
    type === "cash" &&
    (sleevePercents.cash !== 100 ||
      sleevePercents.bonds !== 0 ||
      sleevePercents.equities !== 0 ||
      sleevePercents.other !== 0)
  ) {
    fail(path, "Cash assets stay 100% in the cash sleeve.");
  }
  return {
    name,
    type,
    isLiquid: formData.get("isLiquid") === "1",
    includeInAllocation: formData.get("includeInAllocation") === "1",
    sleevePercents,
    notes: readNotes(formData, path),
  };
}

function readSleevePercents(formData: FormData): AllocationPercents {
  return {
    cash: readPercent(formData.get("cashPct")),
    bonds: readPercent(formData.get("bondsPct")),
    equities: readPercent(formData.get("equitiesPct")),
    other: readPercent(formData.get("otherPct")),
  };
}

function readPercent(raw: FormDataEntryValue | null): number {
  const text = String(raw ?? "").trim();
  if (!/^-?\d+$/.test(text)) return Number.NaN;
  return Number(text);
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

export async function updateAssetSnapshotAction(formData: FormData) {
  const snapshotId = Number(String(formData.get("snapshotId") ?? ""));
  if (!Number.isSafeInteger(snapshotId) || snapshotId < 1) fail("/assets", "Snapshot not found.");
  const existing = getSnapshot(snapshotId);
  if (!existing || existing.assetId === null) fail("/assets", "Snapshot not found.");
  const path = `/assets/${existing.assetId}`;

  const parsed = parseMoneyToCents(String(formData.get("amount") ?? ""));
  if (!parsed.ok) fail(path, parsed.error);

  const recordedOn = String(formData.get("recordedOn") ?? "");
  if (!isValidIsoDate(recordedOn)) fail(path, "Enter a valid date.");

  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 500) fail(path, "Note must be 500 characters or fewer.");

  try {
    const updated = updateSnapshot(snapshotId, {
      recordedOn,
      amountCents: parsed.cents,
      note: note.length === 0 ? null : note,
    });
    if (!updated) fail(path, "Snapshot not found.");
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Could not update the snapshot.");
  }

  revalidatePath(path);
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot-updated`);
}

export async function deleteAssetSnapshotAction(formData: FormData) {
  const snapshotId = Number(String(formData.get("id") ?? ""));
  if (!Number.isSafeInteger(snapshotId) || snapshotId < 1) fail("/assets", "Snapshot not found.");
  const existing = getSnapshot(snapshotId);
  if (!existing || existing.assetId === null) fail("/assets", "Snapshot not found.");
  const path = `/assets/${existing.assetId}`;

  const result = deleteSnapshot(snapshotId);
  if (!result.ok && result.reason === "not_found") fail(path, "Snapshot not found.");
  if (!result.ok && result.reason === "linked") {
    fail(
      path,
      "This snapshot is linked to a journal entry. Go to Activity and unlink the entry first.",
    );
  }

  revalidatePath(path);
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot-deleted`);
}
