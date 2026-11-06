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
  listExpenses,
  updateExpense,
} from "@/db/repositories/expenses";
import {
  createIncome,
  deleteIncome,
  updateIncome,
} from "@/db/repositories/incomes";
import { isValidIsoDate } from "@/db/repositories/snapshots";
import { parseMoneyToCents } from "@/lib/money";

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

function fail(
  tab: string,
  message: string,
  editId?: number,
): never {
  redirect(
    activityPath(tab, {
      error: message,
      edit: editId === undefined ? undefined : String(editId),
    }),
  );
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

function readNote(formData: FormData, tab: string, editId?: number): string | null {
  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 500) {
    fail(tab, "Note must be 500 characters or fewer.", editId);
  }
  return note.length === 0 ? null : note;
}

function readCategoryId(
  formData: FormData,
  tab: string,
  editId?: number,
): number | null {
  const raw = String(formData.get("categoryId") ?? "").trim();
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) fail(tab, "Choose a category.", editId);
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) fail(tab, "Choose a category.", editId);
  return id;
}

function readJournalInput(formData: FormData, tab: JournalTab, editId?: number) {
  const parsed = parseMoneyToCents(String(formData.get("amount") ?? ""));
  if (!parsed.ok) fail(tab, parsed.error, editId);
  if (parsed.cents <= 0) {
    fail(tab, "Enter an amount greater than zero.", editId);
  }
  const occurredOn = String(formData.get("occurredOn") ?? "");
  if (!isValidIsoDate(occurredOn)) fail(tab, "Enter a valid date.", editId);
  return {
    amountCents: parsed.cents,
    occurredOn,
    categoryId: readCategoryId(formData, tab, editId),
    note: readNote(formData, tab, editId),
  };
}

function readKind(formData: FormData): CategoryKind {
  const kind = String(formData.get("kind") ?? "");
  if (!isCategoryKind(kind)) fail("expenses", "Choose a valid category kind.");
  return kind;
}

function categoryTab(kind: CategoryKind): JournalTab {
  return kind === "income" ? "income" : "expenses";
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

export async function createExpenseAction(formData: FormData) {
  const input = readJournalInput(formData, "expenses");
  try {
    createExpense(input);
  } catch (error) {
    fail(
      "expenses",
      error instanceof Error ? error.message : "Could not save the expense.",
    );
  }
  revalidatePath("/activity");
  redirect(activityPath("expenses", { saved: "expense-created" }));
}

export async function updateExpenseAction(formData: FormData) {
  const id = readId(formData);
  if (id === null) fail("expenses", "Expense not found.");
  const input = readJournalInput(formData, "expenses", id);
  try {
    if (!updateExpense(id, input)) fail("expenses", "Expense not found.", id);
  } catch (error) {
    fail(
      "expenses",
      error instanceof Error ? error.message : "Could not save the expense.",
      id,
    );
  }
  revalidatePath("/activity");
  redirect(activityPath("expenses", { saved: "expense-updated" }));
}

export async function deleteExpenseAction(formData: FormData) {
  const id = readId(formData);
  if (id === null || !deleteExpense(id)) fail("expenses", "Expense not found.");
  revalidatePath("/activity");
  redirect(activityPath("expenses", { saved: "expense-deleted" }));
}

export async function createIncomeAction(formData: FormData) {
  const input = readJournalInput(formData, "income");
  try {
    createIncome(input);
  } catch (error) {
    fail(
      "income",
      error instanceof Error ? error.message : "Could not save the income.",
    );
  }
  revalidatePath("/activity");
  redirect(activityPath("income", { saved: "income-created" }));
}

export async function updateIncomeAction(formData: FormData) {
  const id = readId(formData);
  if (id === null) fail("income", "Income not found.");
  const input = readJournalInput(formData, "income", id);
  try {
    if (!updateIncome(id, input)) fail("income", "Income not found.", id);
  } catch (error) {
    fail(
      "income",
      error instanceof Error ? error.message : "Could not save the income.",
      id,
    );
  }
  revalidatePath("/activity");
  redirect(activityPath("income", { saved: "income-updated" }));
}

export async function deleteIncomeAction(formData: FormData) {
  const id = readId(formData);
  if (id === null || !deleteIncome(id)) fail("income", "Income not found.");
  revalidatePath("/activity");
  redirect(activityPath("income", { saved: "income-deleted" }));
}

export async function createCategoryAction(formData: FormData) {
  const kind = readKind(formData);
  const tab = categoryTab(kind);
  const name = String(formData.get("name") ?? "");
  try {
    createCategory({
      name,
      kind,
      isEssential: formData.get("isEssential") === "1",
    });
  } catch (error) {
    fail(tab, error instanceof Error ? error.message : "Could not save the category.");
  }
  revalidatePath("/activity");
  redirect(activityPath(tab, { saved: "category-created" }));
}

export async function updateCategoryAction(formData: FormData) {
  const id = readId(formData);
  const kind = readKind(formData);
  const tab = categoryTab(kind);
  if (id === null) fail(tab, "Category not found.");
  try {
    const updated = updateCategory(id, {
      name: String(formData.get("name") ?? ""),
      kind,
      isEssential: formData.get("isEssential") === "1",
    });
    if (!updated) fail(tab, "Category not found.");
  } catch (error) {
    fail(tab, error instanceof Error ? error.message : "Could not save the category.");
  }
  revalidatePath("/activity");
  redirect(activityPath(tab, { saved: "category-updated" }));
}

export async function deleteCategoryAction(formData: FormData) {
  const tab = readTab(formData);
  const id = readId(formData);
  if (id === null) fail(tab, "Category not found.");
  const result = deleteCategory(id);
  if (!result.ok && result.reason === "not_found") fail(tab, "Category not found.");
  if (!result.ok && result.reason === "in_use") {
    fail(tab, "Cannot delete a category that has expenses or income attached.");
  }
  revalidatePath("/activity");
  redirect(activityPath(tab, { saved: "category-deleted" }));
}
