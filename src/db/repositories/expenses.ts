import { desc, eq } from "drizzle-orm";
import { isValidIsoDate } from "./snapshots";
import { getCategory } from "./categories";
import {
  createCashLink,
  deleteCashLink,
  updateCashLink,
} from "./cash-link";
import { db } from "../client";
import { assets, categories, expenses, type ExpenseRow } from "../schema";

export type ExpenseRecord = ExpenseRow;

export type ExpenseWithCategory = ExpenseRecord & {
  categoryName: string | null;
  assetName: string | null;
};

export type ExpenseInput = {
  amountCents: number;
  occurredOn: string;
  categoryId: number | null;
  assetId: number | null;
  note: string | null;
};

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

function assertExpenseInput(input: ExpenseInput): ExpenseInput {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    invalid("Enter an amount greater than zero.");
  }
  if (!isValidIsoDate(input.occurredOn)) {
    invalid("Enter a valid date.");
  }
  if (input.note !== null && input.note.length > 500) {
    invalid("Note must be 500 characters or fewer.");
  }
  if (input.categoryId !== null) {
    const category = getCategory(input.categoryId);
    if (!category || category.kind !== "expense") {
      invalid("Choose an expense category.");
    }
  }
  return input;
}

export function listExpenses(): ExpenseWithCategory[] {
  return db
    .select({
      id: expenses.id,
      amountCents: expenses.amountCents,
      occurredOn: expenses.occurredOn,
      categoryId: expenses.categoryId,
      assetId: expenses.assetId,
      linkedSnapshotId: expenses.linkedSnapshotId,
      note: expenses.note,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      categoryName: categories.name,
      assetName: assets.name,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .leftJoin(assets, eq(expenses.assetId, assets.id))
    .orderBy(desc(expenses.occurredOn), desc(expenses.id))
    .all();
}

export function getExpense(id: number): ExpenseRecord | undefined {
  return db.select().from(expenses).where(eq(expenses.id, id)).get();
}

export function createExpense(input: ExpenseInput): ExpenseRecord {
  const value = assertExpenseInput(input);
  const now = new Date().toISOString();
  return db.transaction((tx) => {
    const link = createCashLink(tx, {
      assetId: value.assetId,
      occurredOn: value.occurredOn,
      amountCents: value.amountCents,
      direction: "expense",
    });
    return tx
      .insert(expenses)
      .values({
        amountCents: value.amountCents,
        occurredOn: value.occurredOn,
        categoryId: value.categoryId,
        assetId: link.assetId,
        linkedSnapshotId: link.linkedSnapshotId,
        note: value.note,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  });
}

export function updateExpense(
  id: number,
  input: ExpenseInput,
): ExpenseRecord | undefined {
  const existing = getExpense(id);
  if (!existing) return undefined;
  const value = assertExpenseInput(input);
  return db.transaction((tx) => {
    const link = updateCashLink(
      tx,
      {
        assetId: existing.assetId,
        linkedSnapshotId: existing.linkedSnapshotId,
        amountCents: existing.amountCents,
        occurredOn: existing.occurredOn,
      },
      {
        assetId: value.assetId,
        occurredOn: value.occurredOn,
        amountCents: value.amountCents,
        direction: "expense",
      },
    );
    return tx
      .update(expenses)
      .set({
        amountCents: value.amountCents,
        occurredOn: value.occurredOn,
        categoryId: value.categoryId,
        assetId: link.assetId,
        linkedSnapshotId: link.linkedSnapshotId,
        note: value.note,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(expenses.id, id))
      .returning()
      .get();
  });
}

export function deleteExpense(id: number): boolean {
  const existing = getExpense(id);
  if (!existing) return false;
  db.transaction((tx) => {
    deleteCashLink(tx, {
      assetId: existing.assetId,
      linkedSnapshotId: existing.linkedSnapshotId,
      amountCents: existing.amountCents,
      occurredOn: existing.occurredOn,
    });
    tx.delete(expenses).where(eq(expenses.id, id)).run();
  });
  return true;
}
