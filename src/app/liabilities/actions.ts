"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLiabilityType, type LiabilityType } from "@/domain/net-worth";
import {
  createLiability,
  deleteLiability,
  updateLiability,
} from "@/db/repositories/liabilities";
import {
  addLiabilitySnapshot,
  deleteSnapshot,
  getSnapshot,
  updateSnapshot,
} from "@/db/repositories/snapshots";
import { isValidIsoDate } from "@/lib/dates";
import { parseMoneyToCents } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";

function readId(formData: FormData): number | null {
  const raw = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function extractLiabilityValues(formData: FormData): Record<string, string> {
  return {
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}

function validateLiabilityFields(formData: FormData): {
  errors: Record<string, string>;
  input?: { name: string; type: LiabilityType; notes: string | null };
} {
  const errors: Record<string, string> = {};
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) errors.name = "Enter a name.";
  else if (name.length > 200) errors.name = "Name must be 200 characters or fewer.";

  const type = String(formData.get("type") ?? "");
  if (!isLiabilityType(type)) errors.type = "Choose a valid liability type.";

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 2000) errors.notes = "Notes must be 2000 characters or fewer.";

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors: {},
    input: { name, type: type as LiabilityType, notes: notes.length === 0 ? null : notes },
  };
}

export async function createLiabilityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractLiabilityValues(formData);
  const { errors, input } = validateLiabilityFields(formData);
  if (!input) return { errors, values };

  let id: number;
  try {
    id = createLiability(input).id;
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the liability." },
      values,
    };
  }
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`/liabilities/${id}?saved=created`);
}

export async function updateLiabilityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractLiabilityValues(formData);
  const id = readId(formData);
  if (id === null) {
    redirect("/liabilities?error=" + encodeURIComponent("Liability not found."));
  }
  const { errors, input } = validateLiabilityFields(formData);
  if (!input) return { errors, values };

  try {
    const updated = updateLiability(id, input);
    if (!updated) {
      redirect("/liabilities?error=" + encodeURIComponent("Liability not found."));
    }
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the liability." },
      values,
    };
  }
  revalidatePath(`/liabilities/${id}`);
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`/liabilities/${id}?saved=updated`);
}

export async function deleteLiabilityAction(formData: FormData) {
  const id = readId(formData);
  if (id === null || !deleteLiability(id)) {
    redirect("/liabilities?error=" + encodeURIComponent("Liability not found."));
  }
  revalidatePath("/liabilities");
  revalidatePath("/");
  revalidatePath(`/liabilities/${id}`);
  redirect("/liabilities?saved=deleted");
}

export async function addLiabilitySnapshotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = String(formData.get("liabilityId") ?? "");
  const liabilityId = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(liabilityId)) {
    redirect("/liabilities?error=" + encodeURIComponent("Liability not found."));
  }
  const path = `/liabilities/${liabilityId}`;

  const errors: Record<string, string> = {};
  const values: Record<string, string> = {
    amount: String(formData.get("amount") ?? ""),
    recordedOn: String(formData.get("recordedOn") ?? ""),
    note: String(formData.get("note") ?? ""),
  };

  const parsed = parseMoneyToCents(values.amount);
  if (!parsed.ok) errors.amount = parsed.error;

  if (!isValidIsoDate(values.recordedOn)) errors.recordedOn = "Enter a valid date.";

  if (values.note.trim().length > 500) errors.note = "Note must be 500 characters or fewer.";

  if (Object.keys(errors).length > 0) return { errors, values };

  try {
    addLiabilitySnapshot(liabilityId, {
      recordedOn: values.recordedOn,
      amountCents: (parsed as { ok: true; cents: number }).cents,
      note: values.note.trim().length === 0 ? null : values.note.trim(),
    });
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not add the snapshot." },
      values,
    };
  }
  revalidatePath(path);
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot`);
}

export async function updateLiabilitySnapshotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const snapshotId = Number(String(formData.get("snapshotId") ?? ""));
  if (!Number.isSafeInteger(snapshotId) || snapshotId < 1) {
    redirect("/liabilities?error=" + encodeURIComponent("Snapshot not found."));
  }
  const existing = getSnapshot(snapshotId);
  if (!existing || existing.liabilityId === null) {
    redirect("/liabilities?error=" + encodeURIComponent("Snapshot not found."));
  }
  const path = `/liabilities/${existing.liabilityId}`;

  const errors: Record<string, string> = {};
  const values: Record<string, string> = {
    amount: String(formData.get("amount") ?? ""),
    recordedOn: String(formData.get("recordedOn") ?? ""),
    note: String(formData.get("note") ?? ""),
  };

  const parsed = parseMoneyToCents(values.amount);
  if (!parsed.ok) errors.amount = parsed.error;

  if (!isValidIsoDate(values.recordedOn)) errors.recordedOn = "Enter a valid date.";

  if (values.note.trim().length > 500) errors.note = "Note must be 500 characters or fewer.";

  if (Object.keys(errors).length > 0) return { errors, values };

  try {
    const updated = updateSnapshot(snapshotId, {
      recordedOn: values.recordedOn,
      amountCents: (parsed as { ok: true; cents: number }).cents,
      note: values.note.trim().length === 0 ? null : values.note.trim(),
    });
    if (!updated) {
      redirect(path + "?error=" + encodeURIComponent("Snapshot not found."));
    }
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not update the snapshot." },
      values,
    };
  }
  revalidatePath(path);
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot-updated`);
}

export async function deleteLiabilitySnapshotAction(formData: FormData) {
  const snapshotId = Number(String(formData.get("id") ?? ""));
  if (!Number.isSafeInteger(snapshotId) || snapshotId < 1) {
    redirect("/liabilities?error=" + encodeURIComponent("Snapshot not found."));
  }
  const existing = getSnapshot(snapshotId);
  if (!existing || existing.liabilityId === null) {
    redirect("/liabilities?error=" + encodeURIComponent("Snapshot not found."));
  }
  const path = `/liabilities/${existing.liabilityId}`;

  const result = deleteSnapshot(snapshotId);
  if (!result.ok && result.reason === "not_found") {
    redirect(path + "?error=" + encodeURIComponent("Snapshot not found."));
  }
  if (!result.ok && result.reason === "linked") {
    redirect(
      path +
        "?error=" +
        encodeURIComponent(
          "This snapshot is linked to a journal entry. Go to Activity and unlink the entry first.",
        ),
    );
  }
  revalidatePath(path);
  revalidatePath("/liabilities");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot-deleted`);
}
