"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createGoal, deleteGoal, updateGoal } from "@/db/repositories/goals";
import { parseMoneyToCents } from "@/lib/money";
import { isValidIsoDate } from "@/lib/dates";
import type { ActionState } from "@/lib/action-state";

function readId(formData: FormData): number | null {
  const raw = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

const goalSchema = z.object({
  name: z
    .string()
    .min(1, "Enter a name.")
    .max(200, "Name must be 200 characters or fewer."),
  targetDate: z
    .string()
    .min(1, "Enter a target date.")
    .refine(isValidIsoDate, "Enter a valid date (YYYY-MM-DD)."),
  targetAmount: z.string().min(1, "Enter a target amount."),
  setAside: z.string(),
  plannedMonthly: z.string(),
  expectedReturn: z.string(),
});

function extractGoalValues(formData: FormData): Record<string, string> {
  return {
    name: String(formData.get("name") ?? ""),
    targetDate: String(formData.get("targetDate") ?? ""),
    targetAmount: String(formData.get("targetAmount") ?? ""),
    setAside: String(formData.get("setAside") ?? ""),
    plannedMonthly: String(formData.get("plannedMonthly") ?? ""),
    expectedReturn: String(formData.get("expectedReturn") ?? ""),
  };
}

function validateGoalFields(formData: FormData): {
  errors: Record<string, string>;
  input?: {
    name: string;
    targetDate: string;
    targetAmountCents: number;
    setAsideCents: number;
    plannedMonthlyCents: number | null;
    expectedAnnualReturnBps: number | null;
  };
} {
  const values = extractGoalValues(formData);
  const result = goalSchema.safeParse(values);
  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.errors) {
      const field = String(issue.path[0] ?? "_form");
      if (!errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const errors: Record<string, string> = {};

  const targetParsed = parseMoneyToCents(values.targetAmount);
  if (!targetParsed.ok) {
    errors.targetAmount = targetParsed.error;
  } else if (targetParsed.cents <= 0) {
    errors.targetAmount = "Enter a target amount greater than zero.";
  }

  let setAsideCents = 0;
  if (values.setAside.trim() !== "") {
    const p = parseMoneyToCents(values.setAside);
    if (!p.ok) errors.setAside = p.error;
    else setAsideCents = p.cents;
  }

  let plannedMonthlyCents: number | null = null;
  if (values.plannedMonthly.trim() !== "") {
    const p = parseMoneyToCents(values.plannedMonthly);
    if (!p.ok) errors.plannedMonthly = p.error;
    else plannedMonthlyCents = p.cents;
  }

  let expectedAnnualReturnBps: number | null = null;
  if (values.expectedReturn.trim() !== "") {
    if (!/^\d+(\.\d{1,2})?$/.test(values.expectedReturn)) {
      errors.expectedReturn =
        "Enter a yearly growth rate from 0 to 100, with up to 2 decimal places.";
    } else {
      const [whole, fraction = ""] = values.expectedReturn.split(".");
      const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      if (!Number.isSafeInteger(bps) || bps > 10_000) {
        errors.expectedReturn = "Enter a yearly growth rate from 0 to 100.";
      } else {
        expectedAnnualReturnBps = bps;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors: {},
    input: {
      name: values.name,
      targetDate: values.targetDate,
      targetAmountCents: (targetParsed as { ok: true; cents: number }).cents,
      setAsideCents,
      plannedMonthlyCents,
      expectedAnnualReturnBps,
    },
  };
}

function refreshGoals(id?: number) {
  revalidatePath("/");
  revalidatePath("/goals");
  if (id !== undefined) revalidatePath(`/goals/${id}`);
}

export async function createGoalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractGoalValues(formData);
  const { errors, input } = validateGoalFields(formData);
  if (!input) return { errors, values };

  let id: number;
  try {
    id = createGoal(input).id;
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the goal." },
      values,
    };
  }
  refreshGoals(id);
  redirect(`/goals/${id}?saved=created`);
}

export async function updateGoalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractGoalValues(formData);
  const id = readId(formData);
  if (id === null) {
    redirect("/goals?error=" + encodeURIComponent("Goal not found."));
  }
  const { errors, input } = validateGoalFields(formData);
  if (!input) return { errors, values };

  let updated: ReturnType<typeof updateGoal>;
  try {
    updated = updateGoal(id, input);
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the goal." },
      values,
    };
  }
  if (!updated) redirect("/goals?error=" + encodeURIComponent("Goal not found."));
  refreshGoals(id);
  redirect(`/goals/${id}?saved=updated`);
}

export async function deleteGoalAction(formData: FormData) {
  const id = readId(formData);
  if (id === null || !deleteGoal(id)) {
    redirect("/goals?error=" + encodeURIComponent("Goal not found."));
  }
  refreshGoals(id);
  redirect("/goals?saved=deleted");
}
