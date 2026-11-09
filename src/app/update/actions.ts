"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  batchAddSnapshots,
  getLatestSnapshot,
  getLatestSnapshotForLiability,
  type BatchSnapshotEntry,
} from "@/db/repositories/snapshots";
import { isValidIsoDate } from "@/lib/dates";
import { parseMoneyToCents } from "@/lib/money";

export type UpdateBalancesState = {
  errors: Record<string, string>;
  values: Record<string, string>;
} | null;

export async function updateBalancesAction(
  _prev: UpdateBalancesState,
  formData: FormData,
): Promise<UpdateBalancesState> {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};

  const recordedOn = String(formData.get("recordedOn") ?? "").trim();
  values.recordedOn = recordedOn;
  if (!isValidIsoDate(recordedOn)) {
    errors.recordedOn = "Enter a valid date.";
  }

  const rawAssetIds = String(formData.get("assetIds") ?? "");
  const rawLiabilityIds = String(formData.get("liabilityIds") ?? "");
  const assetIds = rawAssetIds ? rawAssetIds.split(",").map(Number).filter(Number.isFinite) : [];
  const liabilityIds = rawLiabilityIds ? rawLiabilityIds.split(",").map(Number).filter(Number.isFinite) : [];

  const entries: BatchSnapshotEntry[] = [];

  for (const assetId of assetIds) {
    const key = `asset_${assetId}`;
    const raw = String(formData.get(key) ?? "").trim();
    values[key] = raw;
    if (raw === "") continue;

    const parsed = parseMoneyToCents(raw);
    if (!parsed.ok) {
      errors[key] = parsed.error;
      continue;
    }

    const latest = getLatestSnapshot(assetId);
    if (latest !== null && parsed.cents === latest.amountCents) continue;

    entries.push({ kind: "asset", assetId, recordedOn, amountCents: parsed.cents });
  }

  for (const liabilityId of liabilityIds) {
    const key = `liability_${liabilityId}`;
    const raw = String(formData.get(key) ?? "").trim();
    values[key] = raw;
    if (raw === "") continue;

    const parsed = parseMoneyToCents(raw);
    if (!parsed.ok) {
      errors[key] = parsed.error;
      continue;
    }

    const latest = getLatestSnapshotForLiability(liabilityId);
    if (latest !== null && parsed.cents === latest.amountCents) continue;

    entries.push({ kind: "liability", liabilityId, recordedOn, amountCents: parsed.cents });
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values };
  }

  if (entries.length === 0) {
    redirect("/update?saved=nochange");
  }

  batchAddSnapshots(entries);
  revalidatePath("/", "layout");
  redirect(`/update?saved=${entries.length}`);
}
