"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, updateSettings } from "@/db/repositories/settings";
import { parseMoneyToCents } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";

export async function saveSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values: Record<string, string> = {
    displayCurrency: String(formData.get("displayCurrency") ?? ""),
    emergencyFundTargetMonths: String(formData.get("emergencyFundTargetMonths") ?? ""),
    essentialMonthlySpendOverride: String(formData.get("essentialMonthlySpendOverride") ?? ""),
  };
  const errors: Record<string, string> = {};

  const currency = values.displayCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.displayCurrency = "Display currency must be 3 letters.";
  }

  const monthsRaw = values.emergencyFundTargetMonths.trim();
  const months = Number(monthsRaw);
  if (!/^\d+$/.test(monthsRaw) || months < 1 || months > 24) {
    errors.emergencyFundTargetMonths =
      "Emergency fund target months must be a whole number from 1 to 24.";
  }

  let overrideCents: number | null = null;
  if (values.essentialMonthlySpendOverride.trim() !== "") {
    const parsed = parseMoneyToCents(values.essentialMonthlySpendOverride);
    if (!parsed.ok) {
      errors.essentialMonthlySpendOverride = parsed.error;
    } else {
      overrideCents = parsed.cents;
    }
  }

  if (Object.keys(errors).length > 0) return { errors, values };

  const existing = getSettings();
  if (!existing) {
    return {
      errors: {
        _form: "Settings are not initialized. Run pnpm db:migrate.",
      },
      values,
    };
  }

  updateSettings({
    displayCurrency: currency,
    emergencyFundTargetMonths: months,
    essentialMonthlySpendOverrideCents: overrideCents,
  });

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
