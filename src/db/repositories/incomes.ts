import { desc, eq } from "drizzle-orm";
import { isValidIsoDate } from "./snapshots";
import { getCategory } from "./categories";
import { db } from "../client";
import { categories, incomes, type IncomeRow } from "../schema";

export type IncomeRecord = IncomeRow;

export type IncomeWithCategory = IncomeRecord & {
  categoryName: string | null;
};

export type IncomeInput = {
  amountCents: number;
  occurredOn: string;
  categoryId: number | null;
  note: string | null;
};

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

function assertIncomeInput(input: IncomeInput): IncomeInput {
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
    if (!category || category.kind !== "income") {
      invalid("Choose an income category.");
    }
  }
  return input;
}

export function listIncomes(): IncomeWithCategory[] {
  return db
    .select({
      id: incomes.id,
      amountCents: incomes.amountCents,
      occurredOn: incomes.occurredOn,
      categoryId: incomes.categoryId,
      note: incomes.note,
      createdAt: incomes.createdAt,
      updatedAt: incomes.updatedAt,
      categoryName: categories.name,
    })
    .from(incomes)
    .leftJoin(categories, eq(incomes.categoryId, categories.id))
    .orderBy(desc(incomes.occurredOn), desc(incomes.id))
    .all();
}

export function getIncome(id: number): IncomeRecord | undefined {
  return db.select().from(incomes).where(eq(incomes.id, id)).get();
}

export function createIncome(input: IncomeInput): IncomeRecord {
  const value = assertIncomeInput(input);
  const now = new Date().toISOString();
  return db
    .insert(incomes)
    .values({
      amountCents: value.amountCents,
      occurredOn: value.occurredOn,
      categoryId: value.categoryId,
      note: value.note,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export function updateIncome(
  id: number,
  input: IncomeInput,
): IncomeRecord | undefined {
  if (!getIncome(id)) return undefined;
  const value = assertIncomeInput(input);
  return db
    .update(incomes)
    .set({
      amountCents: value.amountCents,
      occurredOn: value.occurredOn,
      categoryId: value.categoryId,
      note: value.note,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(incomes.id, id))
    .returning()
    .get();
}

export function deleteIncome(id: number): boolean {
  if (!getIncome(id)) return false;
  db.delete(incomes).where(eq(incomes.id, id)).run();
  return true;
}
