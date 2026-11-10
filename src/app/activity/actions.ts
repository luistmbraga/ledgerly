"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { suggestCategory } from "@/ai/tasks/category-suggest";
import {
  createCategory,
  deleteCategory,
  isCategoryKind,
  listCategories,
  updateCategory,
  type CategoryKind,
} from "@/db/repositories/categories";
import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  unlinkExpenseCash,
  updateExpense,
} from "@/db/repositories/expenses";
import {
  createIncome,
  deleteIncome,
  getIncome,
  unlinkIncomeCash,
  updateIncome,
} from "@/db/repositories/incomes";
import { isValidIsoDate } from "@/lib/dates";
import { parseMoneyToCents } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";

type JournalTab = "expenses" | "income";

function activityPath(
  tab: string,
  extra?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams({ tab });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  return `/activity?${params.toString()}`;
}

function readTab(formData: FormData): JournalTab {
  return formData.get("tab") === "income" ? "income" : "expenses";
}

function readId(formData: FormData): number | null {
  const raw = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function readKind(formData: FormData): CategoryKind | null {
  const kind = String(formData.get("kind") ?? "");
  return isCategoryKind(kind) ? kind : null;
}

function categoryTab(kind: CategoryKind): JournalTab {
  return kind === "income" ? "income" : "expenses";
}

function extractJournalValues(formData: FormData): Record<string, string> {
  return {
    amount: String(formData.get("amount") ?? ""),
    occurredOn: String(formData.get("occurredOn") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    assetId: String(formData.get("assetId") ?? ""),
    note: String(formData.get("note") ?? ""),
  };
}

function validateJournalFields(formData: FormData): {
  errors: Record<string, string>;
  input?: {
    amountCents: number;
    occurredOn: string;
    categoryId: number | null;
    assetId: number | null;
    note: string | null;
  };
} {
  const errors: Record<string, string> = {};

  const amountRaw = String(formData.get("amount") ?? "");
  const parsed = parseMoneyToCents(amountRaw);
  if (!parsed.ok) errors.amount = parsed.error;
  else if (parsed.cents <= 0) errors.amount = "Enter an amount greater than zero.";

  const occurredOn = String(formData.get("occurredOn") ?? "");
  if (!isValidIsoDate(occurredOn)) errors.occurredOn = "Enter a valid date.";

  const categoryRaw = String(formData.get("categoryId") ?? "").trim();
  let categoryId: number | null = null;
  if (categoryRaw !== "") {
    if (!/^\d+$/.test(categoryRaw)) errors.categoryId = "Choose a category.";
    else {
      const cid = Number(categoryRaw);
      if (!Number.isSafeInteger(cid)) errors.categoryId = "Choose a category.";
      else categoryId = cid;
    }
  }

  const assetRaw = String(formData.get("assetId") ?? "").trim();
  let assetId: number | null = null;
  if (assetRaw !== "") {
    if (!/^\d+$/.test(assetRaw)) errors.assetId = "Choose a cash account.";
    else {
      const aid = Number(assetRaw);
      if (!Number.isSafeInteger(aid)) errors.assetId = "Choose a cash account.";
      else assetId = aid;
    }
  }

  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 500) errors.note = "Note must be 500 characters or fewer.";

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors: {},
    input: {
      amountCents: (parsed as { ok: true; cents: number }).cents,
      occurredOn,
      categoryId,
      assetId,
      note: note.length === 0 ? null : note,
    },
  };
}

function revalidateJournalPaths(assetId: number | null) {
  revalidatePath("/activity");
  revalidatePath("/");
  revalidatePath("/assets");
  revalidatePath("/emergency-fund");
  if (assetId !== null) {
    revalidatePath(`/assets/${assetId}`);
  }
}

export async function suggestExpenseCategory(input: {
  expenseId: number | null;
  amount: string;
  occurredOn: string;
  note: string;
}): Promise<
  | {
      ok: true;
      categoryId: number | null;
      categoryName: string | null;
      rationale: string;
      confidence: "low" | "medium" | "high";
      source: "ai" | "cache" | "fallback";
      refusalReason?: string;
    }
  | { ok: false; error: string }
> {
  const parsed = parseMoneyToCents(input.amount);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.cents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (!isValidIsoDate(input.occurredOn)) {
    return { ok: false, error: "Enter a valid date." };
  }
  const note = input.note.trim().slice(0, 500);
  const categories = listCategories("expense");
  const result = await suggestCategory({
    expenseId: input.expenseId,
    amountCents: parsed.cents,
    occurredOn: input.occurredOn,
    note,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      isEssential: category.isEssential,
    })),
    recentExpenses: listExpenses().map((expense) => ({
      occurredOn: expense.occurredOn,
      categoryId: expense.categoryId,
      note: expense.note,
    })),
  });
  const match =
    result.output.categoryId === null
      ? undefined
      : categories.find((category) => category.id === result.output.categoryId);
  return {
    ok: true,
    categoryId: result.output.categoryId,
    categoryName: match?.name ?? null,
    rationale: result.output.rationale,
    confidence: result.output.confidence,
    source: result.source,
    refusalReason: result.refusalReason,
  };
}

export async function createExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractJournalValues(formData);
  const { errors, input } = validateJournalFields(formData);
  if (!input) return { errors, values };

  try {
    createExpense(input);
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the expense." },
      values,
    };
  }
  revalidateJournalPaths(input.assetId);
  redirect(activityPath("expenses", { saved: "expense-created" }));
}

export async function updateExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractJournalValues(formData);
  const id = readId(formData);
  if (id === null) {
    redirect(activityPath("expenses", { error: "Expense not found." }));
  }
  const { errors, input } = validateJournalFields(formData);
  if (!input) return { errors, values };

  try {
    if (!updateExpense(id, input)) {
      redirect(activityPath("expenses", { error: "Expense not found." }));
    }
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the expense." },
      values,
    };
  }
  revalidateJournalPaths(input.assetId);
  redirect(activityPath("expenses", { saved: "expense-updated" }));
}

export async function deleteExpenseAction(formData: FormData) {
  const id = readId(formData);
  if (id === null) redirect(activityPath("expenses", { error: "Expense not found." }));
  const existing = getExpense(id!);
  if (!existing || !deleteExpense(id!)) {
    redirect(activityPath("expenses", { error: "Expense not found." }));
  }
  revalidateJournalPaths(existing.assetId);
  redirect(activityPath("expenses", { saved: "expense-deleted" }));
}

export async function createIncomeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractJournalValues(formData);
  const { errors, input } = validateJournalFields(formData);
  if (!input) return { errors, values };

  try {
    createIncome(input);
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the income." },
      values,
    };
  }
  revalidateJournalPaths(input.assetId);
  redirect(activityPath("income", { saved: "income-created" }));
}

export async function updateIncomeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractJournalValues(formData);
  const id = readId(formData);
  if (id === null) {
    redirect(activityPath("income", { error: "Income not found." }));
  }
  const { errors, input } = validateJournalFields(formData);
  if (!input) return { errors, values };

  try {
    if (!updateIncome(id, input)) {
      redirect(activityPath("income", { error: "Income not found." }));
    }
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the income." },
      values,
    };
  }
  revalidateJournalPaths(input.assetId);
  redirect(activityPath("income", { saved: "income-updated" }));
}

export async function deleteIncomeAction(formData: FormData) {
  const id = readId(formData);
  if (id === null) redirect(activityPath("income", { error: "Income not found." }));
  const existing = getIncome(id!);
  if (!existing || !deleteIncome(id!)) {
    redirect(activityPath("income", { error: "Income not found." }));
  }
  revalidateJournalPaths(existing.assetId);
  redirect(activityPath("income", { saved: "income-deleted" }));
}

export async function unlinkExpenseCashAction(formData: FormData) {
  const id = readId(formData);
  if (id === null) redirect(activityPath("expenses", { error: "Expense not found." }));
  const existing = getExpense(id!);
  if (!existing) redirect(activityPath("expenses", { error: "Expense not found." }));
  if (!unlinkExpenseCash(id!)) {
    redirect(activityPath("expenses", { error: "This expense has no cash link to remove." }));
  }
  revalidateJournalPaths(existing!.assetId);
  redirect(activityPath("expenses", { saved: "expense-unlinked" }));
}

export async function unlinkIncomeCashAction(formData: FormData) {
  const id = readId(formData);
  if (id === null) redirect(activityPath("income", { error: "Income not found." }));
  const existing = getIncome(id!);
  if (!existing) redirect(activityPath("income", { error: "Income not found." }));
  if (!unlinkIncomeCash(id!)) {
    redirect(activityPath("income", { error: "This income has no cash link to remove." }));
  }
  revalidateJournalPaths(existing!.assetId);
  redirect(activityPath("income", { saved: "income-unlinked" }));
}

export async function createCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const kind = readKind(formData);
  if (!kind) {
    return { errors: { kind: "Choose a valid category kind." }, values: {} };
  }
  const tab = categoryTab(kind);
  const name = String(formData.get("name") ?? "").trim();
  const values = { name, kind };

  if (name.length === 0) return { errors: { name: "Enter a name." }, values };
  if (name.length > 80) return { errors: { name: "Name must be 80 characters or fewer." }, values };

  try {
    createCategory({
      name,
      kind,
      isEssential: formData.get("isEssential") === "1",
    });
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the category." },
      values,
    };
  }
  revalidatePath("/activity");
  redirect(activityPath(tab, { saved: "category-created" }));
}

export async function updateCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = readId(formData);
  const kind = readKind(formData);
  if (!kind) {
    return { errors: { kind: "Choose a valid category kind." }, values: {} };
  }
  const tab = categoryTab(kind);
  const name = String(formData.get("name") ?? "").trim();
  const values = { name, kind };

  if (id === null) {
    redirect(activityPath(tab, { error: "Category not found." }));
  }
  if (name.length === 0) return { errors: { name: "Enter a name." }, values };
  if (name.length > 80) return { errors: { name: "Name must be 80 characters or fewer." }, values };

  let budgetMonthlyCents: number | null = null;
  if (kind === "expense") {
    const budgetRaw = String(formData.get("budgetMonthlyCents") ?? "").trim();
    if (budgetRaw !== "") {
      const parsed = parseMoneyToCents(budgetRaw);
      if (!parsed.ok) return { errors: { budgetMonthlyCents: parsed.error }, values };
      if (parsed.cents <= 0) {
        return { errors: { budgetMonthlyCents: "Enter a positive amount or leave blank to remove the budget." }, values };
      }
      budgetMonthlyCents = parsed.cents;
    }
  }

  try {
    const updated = updateCategory(id, {
      name,
      kind,
      isEssential: formData.get("isEssential") === "1",
      budgetMonthlyCents,
    });
    if (!updated) redirect(activityPath(tab, { error: "Category not found." }));
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the category." },
      values,
    };
  }
  revalidatePath("/activity");
  redirect(activityPath(tab, { saved: "category-updated" }));
}

export async function deleteCategoryAction(formData: FormData) {
  const tab = readTab(formData);
  const id = readId(formData);
  if (id === null) redirect(activityPath(tab, { error: "Category not found." }));
  const result = deleteCategory(id!);
  if (!result.ok && result.reason === "not_found") {
    redirect(activityPath(tab, { error: "Category not found." }));
  }
  if (!result.ok && result.reason === "in_use") {
    redirect(
      activityPath(tab, {
        error: "Cannot delete a category that has expenses or income attached.",
      }),
    );
  }
  revalidatePath("/activity");
  redirect(activityPath(tab, { saved: "category-deleted" }));
}
