"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLiabilityType } from "@/domain/net-worth";
import {
  createLiability,
  deleteLiability,
  updateLiability,
} from "@/db/repositories/liabilities";
import {
  addLiabilitySnapshot,
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
  const raw = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function readLiabilityFields(formData: FormData, path: string) {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0 || name.length > 200) {
    fail(path, "Enter a name up to 200 characters.");
  }
  const type = String(formData.get("type") ?? "");
  if (!isLiabilityType(type)) {
    fail(path, "Choose a valid liability type.");
  }
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 2000) {
    fail(path, "Notes must be 2000 characters or fewer.");
  }
  return {
    name,
    type,
    notes: notes.length === 0 ? null : notes,
  };
}

export async function createLiabilityAction(formData: FormData) {
  const input = readLiabilityFields(formData, "/liabilities");
  let id: number;
  try {
    id = createLiability(input).id;
  } catch (error) {
    fail(
      "/liabilities",
      error instanceof Error ? error.message : "Could not save the liability.",
    );
  }
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`/liabilities/${id}?saved=created`);
}

export async function updateLiabilityAction(formData: FormData) {
  const id = readId(formData);
  const path = id === null ? "/liabilities" : `/liabilities/${id}`;
  if (id === null) fail("/liabilities", "Liability not found.");
  const input = readLiabilityFields(formData, path);
  try {
    const updated = updateLiability(id, input);
    if (!updated) fail(path, "Liability not found.");
  } catch (error) {
    fail(
      path,
      error instanceof Error ? error.message : "Could not save the liability.",
    );
  }
  revalidatePath(path);
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`${path}?saved=updated`);
}

export async function deleteLiabilityAction(formData: FormData) {
  const id = readId(formData);
  if (id === null || !deleteLiability(id)) {
    fail("/liabilities", "Liability not found.");
  }
  revalidatePath("/liabilities");
  revalidatePath("/");
  revalidatePath(`/liabilities/${id}`);
  redirect("/liabilities?saved=deleted");
}

export async function addLiabilitySnapshotAction(formData: FormData) {
  const raw = String(formData.get("liabilityId") ?? "");
  const liabilityId = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  const path = Number.isSafeInteger(liabilityId)
    ? `/liabilities/${liabilityId}`
    : "/liabilities";
  if (!Number.isSafeInteger(liabilityId)) fail("/liabilities", "Liability not found.");

  const parsed = parseMoneyToCents(String(formData.get("amount") ?? ""));
  if (!parsed.ok) fail(path, parsed.error);

  const recordedOn = String(formData.get("recordedOn") ?? "");
  if (!isValidIsoDate(recordedOn)) fail(path, "Enter a valid date.");

  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 500) fail(path, "Note must be 500 characters or fewer.");

  try {
    addLiabilitySnapshot(liabilityId, {
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
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot`);
}

export async function updateLiabilitySnapshotAction(formData: FormData) {
  const snapshotId = Number(String(formData.get("snapshotId") ?? ""));
  if (!Number.isSafeInteger(snapshotId) || snapshotId < 1) fail("/liabilities", "Snapshot not found.");
  const existing = getSnapshot(snapshotId);
  if (!existing || existing.liabilityId === null) fail("/liabilities", "Snapshot not found.");
  const path = `/liabilities/${existing.liabilityId}`;

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
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot-updated`);
}

export async function deleteLiabilitySnapshotAction(formData: FormData) {
  const snapshotId = Number(String(formData.get("id") ?? ""));
  if (!Number.isSafeInteger(snapshotId) || snapshotId < 1) fail("/liabilities", "Snapshot not found.");
  const existing = getSnapshot(snapshotId);
  if (!existing || existing.liabilityId === null) fail("/liabilities", "Snapshot not found.");
  const path = `/liabilities/${existing.liabilityId}`;

  const result = deleteSnapshot(snapshotId);
  if (!result.ok && result.reason === "not_found") fail(path, "Snapshot not found.");
  if (!result.ok && result.reason === "linked") {
    fail(
      path,
      "This snapshot is linked to a journal entry. Go to Activity and unlink the entry first.",
    );
  }

  revalidatePath(path);
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot-deleted`);
}
