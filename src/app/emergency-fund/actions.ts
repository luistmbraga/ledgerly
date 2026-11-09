"use server";

import { revalidatePath } from "next/cache";
import { getSettings, updateSettings } from "@/db/repositories/settings";
import { parseMoneyToCents } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";

export async function saveEssentialOverrideAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = String(formData.get("essentialMonthlySpend") ?? "").trim();
  const errors: Record<string, string> = {};

  let overrideCents: number | null = null;
  if (raw !== "") {
    const parsed = parseMoneyToCents(raw);
    if (!parsed.ok) {
      errors.essentialMonthlySpend = parsed.error;
    } else if (parsed.cents <= 0) {
      errors.essentialMonthlySpend = "Amount must be greater than zero.";
    } else {
      overrideCents = parsed.cents;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: { essentialMonthlySpend: raw } };
  }

  const existing = getSettings();
  if (!existing) {
    return {
      errors: { _form: "Settings are not initialized. Run pnpm db:migrate." },
      values: { essentialMonthlySpend: raw },
    };
  }

  updateSettings({ essentialMonthlySpendOverrideCents: overrideCents });
  revalidatePath("/emergency-fund");
  revalidatePath("/");
  return { errors: {}, values: { essentialMonthlySpend: raw } };
}
