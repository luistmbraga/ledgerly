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
  updateSnapshot,
} from "@/db/repositories/snapshots";
import { isValidIsoDate } from "@/lib/dates";
import { parseMoneyToCents } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";

function readId(formData: FormData): number | null {
  const raw = String(formData.get("id") ?? formData.get("assetId") ?? "");
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function readPercent(raw: FormDataEntryValue | null): number {
  const text = String(raw ?? "").trim();
  if (!/^-?\d+$/.test(text)) return Number.NaN;
  return Number(text);
}

function readSleevePercents(formData: FormData): AllocationPercents {
  return {
    cash: readPercent(formData.get("cashPct")),
    bonds: readPercent(formData.get("bondsPct")),
    equities: readPercent(formData.get("equitiesPct")),
    other: readPercent(formData.get("otherPct")),
  };
}

function extractAssetValues(formData: FormData): Record<string, string> {
  return {
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    cashPct: String(formData.get("cashPct") ?? ""),
    bondsPct: String(formData.get("bondsPct") ?? ""),
    equitiesPct: String(formData.get("equitiesPct") ?? ""),
    otherPct: String(formData.get("otherPct") ?? ""),
  };
}

function validateAssetFields(formData: FormData): {
  errors: Record<string, string>;
  input?: {
    name: string;
    type: ReturnType<typeof isAssetType> extends true ? string : never;
    isLiquid: boolean;
    includeInAllocation: boolean;
    sleevePercents: AllocationPercents;
    notes: string | null;
  };
} {
  const errors: Record<string, string> = {};
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) errors.name = "Enter a name.";
  else if (name.length > 200) errors.name = "Name must be 200 characters or fewer.";

  const typeRaw = String(formData.get("type") ?? "");
  if (!isAssetType(typeRaw)) errors.type = "Choose a valid asset type.";

  const sleevePercents = readSleevePercents(formData);
  if (!isValidSleevePercents(sleevePercents)) {
    errors.sleeves = "Allocation percents must be whole numbers that sum to 100.";
  }
  if (
    isAssetType(typeRaw) &&
    typeRaw === "cash" &&
    isValidSleevePercents(sleevePercents) &&
    (sleevePercents.cash !== 100 ||
      sleevePercents.bonds !== 0 ||
      sleevePercents.equities !== 0 ||
      sleevePercents.other !== 0)
  ) {
    errors.sleeves = "Cash assets stay 100% in the cash sleeve.";
  }

  const notesRaw = String(formData.get("notes") ?? "").trim();
  if (notesRaw.length > 2000) errors.notes = "Notes must be 2000 characters or fewer.";

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors: {},
    input: {
      name,
      type: typeRaw as never,
      isLiquid: formData.get("isLiquid") === "1",
      includeInAllocation: formData.get("includeInAllocation") === "1",
      sleevePercents,
      notes: notesRaw.length === 0 ? null : notesRaw,
    },
  };
}

export async function createAssetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractAssetValues(formData);
  const { errors, input } = validateAssetFields(formData);
  if (!input) return { errors, values };

  let id: number;
  try {
    id = createAsset(input).id;
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the asset." },
      values,
    };
  }
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`/assets/${id}?saved=created`);
}

export async function updateAssetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractAssetValues(formData);
  const id = readId(formData);
  if (id === null) {
    redirect("/assets?error=" + encodeURIComponent("Asset not found."));
  }
  const { errors, input } = validateAssetFields(formData);
  if (!input) return { errors, values };

  let updated: ReturnType<typeof updateAsset>;
  try {
    updated = updateAsset(id, input);
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the asset." },
      values,
    };
  }
  if (!updated) redirect("/assets?error=" + encodeURIComponent("Asset not found."));
  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`/assets/${id}?saved=updated`);
}

export async function deleteAssetAction(formData: FormData) {
  const id = readId(formData);
  if (id === null || !deleteAsset(id)) {
    redirect("/assets?error=" + encodeURIComponent("Asset not found."));
  }
  revalidatePath("/assets");
  revalidatePath("/");
  revalidatePath(`/assets/${id}`);
  redirect("/assets?saved=deleted");
}

export async function addAssetSnapshotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const assetId = Number(String(formData.get("assetId") ?? ""));
  if (!Number.isSafeInteger(assetId) || assetId < 1) {
    redirect("/assets?error=" + encodeURIComponent("Asset not found."));
  }
  const path = `/assets/${assetId}`;

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
    addAssetSnapshot(assetId, {
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
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot`);
}

export async function updateAssetSnapshotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const snapshotId = Number(String(formData.get("snapshotId") ?? ""));
  if (!Number.isSafeInteger(snapshotId) || snapshotId < 1) {
    redirect("/assets?error=" + encodeURIComponent("Snapshot not found."));
  }
  const existing = getSnapshot(snapshotId);
  if (!existing || existing.assetId === null) {
    redirect("/assets?error=" + encodeURIComponent("Snapshot not found."));
  }
  const path = `/assets/${existing.assetId}`;

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

  let updated: ReturnType<typeof updateSnapshot>;
  try {
    updated = updateSnapshot(snapshotId, {
      recordedOn: values.recordedOn,
      amountCents: (parsed as { ok: true; cents: number }).cents,
      note: values.note.trim().length === 0 ? null : values.note.trim(),
    });
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not update the snapshot." },
      values,
    };
  }
  if (!updated) redirect(path + "?error=" + encodeURIComponent("Snapshot not found."));
  revalidatePath(path);
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot-updated`);
}

export async function deleteAssetSnapshotAction(formData: FormData) {
  const snapshotId = Number(String(formData.get("id") ?? ""));
  if (!Number.isSafeInteger(snapshotId) || snapshotId < 1) {
    redirect("/assets?error=" + encodeURIComponent("Snapshot not found."));
  }
  const existing = getSnapshot(snapshotId);
  if (!existing || existing.assetId === null) {
    redirect("/assets?error=" + encodeURIComponent("Snapshot not found."));
  }
  const path = `/assets/${existing.assetId}`;

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
  revalidatePath("/assets");
  revalidatePath("/");
  redirect(`${path}?saved=snapshot-deleted`);
}
