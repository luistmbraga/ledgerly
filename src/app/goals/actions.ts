"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createGoal, deleteGoal, updateGoal } from "@/db/repositories/goals";
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

function readRequiredMoney(formData: FormData, name: string, path: string): number {
  const parsed = parseMoneyToCents(String(formData.get(name) ?? ""));
  if (!parsed.ok) fail(path, parsed.error);
  if (parsed.cents <= 0) fail(path, "Enter a target amount greater than zero.");
  return parsed.cents;
}

function readOptionalMoney(
  formData: FormData,
  name: string,
  path: string,
): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return null;
  const parsed = parseMoneyToCents(raw);
  if (!parsed.ok) fail(path, parsed.error);
  return parsed.cents;
}

function readReturnBps(formData: FormData, path: string): number | null {
  const raw = String(formData.get("expectedReturn") ?? "").trim();
  if (raw === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    fail(path, "Enter an expected return from 0 to 100 with up to 2 decimal places.");
  }
  const [whole, fraction = ""] = raw.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(bps) || bps > 10_000) {
    fail(path, "Enter an expected return from 0 to 100.");
  }
  return bps;
}

function readGoalFields(formData: FormData, path: string) {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0 || name.length > 200) {
    fail(path, "Enter a name up to 200 characters.");
  }
  const targetDate = String(formData.get("targetDate") ?? "");
  const setAside = readOptionalMoney(formData, "setAside", path);
  return {
    name,
    targetAmountCents: readRequiredMoney(formData, "targetAmount", path),
    targetDate,
    setAsideCents: setAside ?? 0,
    plannedMonthlyCents: readOptionalMoney(formData, "plannedMonthly", path),
    expectedAnnualReturnBps: readReturnBps(formData, path),
  };
}

function refreshGoals(id?: number) {
  revalidatePath("/");
  revalidatePath("/goals");
  if (id !== undefined) revalidatePath(`/goals/${id}`);
}

export async function createGoalAction(formData: FormData) {
  const input = readGoalFields(formData, "/goals");
  let id: number;
  try {
    id = createGoal(input).id;
  } catch (error) {
    fail("/goals", error instanceof Error ? error.message : "Could not save the goal.");
  }
  refreshGoals(id);
  redirect(`/goals/${id}?saved=created`);
}

export async function updateGoalAction(formData: FormData) {
  const id = readId(formData);
  const path = id === null ? "/goals" : `/goals/${id}`;
  if (id === null) fail("/goals", "Goal not found.");
  const input = readGoalFields(formData, path);
  try {
    const updated = updateGoal(id, input);
    if (!updated) fail(path, "Goal not found.");
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Could not save the goal.");
  }
  refreshGoals(id);
  redirect(`${path}?saved=updated`);
}

export async function deleteGoalAction(formData: FormData) {
  const id = readId(formData);
  if (id === null || !deleteGoal(id)) fail("/goals", "Goal not found.");
  refreshGoals(id);
  redirect("/goals?saved=deleted");
}
