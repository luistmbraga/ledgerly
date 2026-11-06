import { and, asc, count, eq } from "drizzle-orm";
import { db } from "../client";
import {
  categories,
  expenses,
  incomes,
  type CategoryRow,
} from "../schema";

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export type CategoryRecord = CategoryRow & { kind: CategoryKind };

export type CategoryInput = {
  name: string;
  kind: CategoryKind;
  isEssential: boolean;
};

export type DeleteCategoryResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "in_use" };

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

export function isCategoryKind(value: string): value is CategoryKind {
  return (CATEGORY_KINDS as readonly string[]).includes(value);
}

function normalize(input: CategoryInput, exceptId?: number): CategoryInput {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 80) {
    invalid("Enter a category name up to 80 characters.");
  }
  if (!isCategoryKind(input.kind)) {
    invalid("Choose a valid category kind.");
  }
  const isEssential = input.kind === "expense" ? input.isEssential : false;
  const taken = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.kind, input.kind), eq(categories.name, name)))
    .all()
    .some((row) => row.id !== exceptId);
  if (taken) {
    invalid("A category with that name already exists.");
  }
  return { name, kind: input.kind, isEssential };
}

function asCategory(row: CategoryRow): CategoryRecord {
  if (!isCategoryKind(row.kind)) {
    throw new Error(`Unknown category kind: ${row.kind}`);
  }
  return {
    ...row,
    kind: row.kind,
    isEssential: row.kind === "expense" ? row.isEssential : false,
  };
}

export function listCategories(kind?: CategoryKind): CategoryRecord[] {
  const rows = (
    kind
      ? db.select().from(categories).where(eq(categories.kind, kind))
      : db.select().from(categories)
  )
    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(categories.id))
    .all();
  return rows.map(asCategory);
}

export function getCategory(id: number): CategoryRecord | undefined {
  const row = db.select().from(categories).where(eq(categories.id, id)).get();
  return row ? asCategory(row) : undefined;
}

export function createCategory(input: CategoryInput): CategoryRecord {
  const value = normalize(input);
  const sortOrder =
    listCategories(value.kind).reduce(
      (max, category) => Math.max(max, category.sortOrder),
      -1,
    ) + 1;
  const row = db
    .insert(categories)
    .values({
      name: value.name,
      kind: value.kind,
      isEssential: value.isEssential,
      sortOrder,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
  return asCategory(row);
}

export function updateCategory(
  id: number,
  input: CategoryInput,
): CategoryRecord | undefined {
  const current = getCategory(id);
  if (!current) return undefined;
  if (input.kind !== current.kind) {
    invalid("Category kind cannot change.");
  }
  const value = normalize(input, id);
  const row = db
    .update(categories)
    .set({
      name: value.name,
      isEssential: value.isEssential,
    })
    .where(eq(categories.id, id))
    .returning()
    .get();
  return asCategory(row);
}

function referenceCount(
  table: typeof expenses | typeof incomes,
  categoryId: number,
): number {
  const column = table === expenses ? expenses.categoryId : incomes.categoryId;
  const row = db
    .select({ value: count() })
    .from(table)
    .where(eq(column, categoryId))
    .get();
  return Number(row?.value ?? 0);
}

export function deleteCategory(id: number): DeleteCategoryResult {
  if (!getCategory(id)) return { ok: false, reason: "not_found" };
  if (referenceCount(expenses, id) > 0 || referenceCount(incomes, id) > 0) {
    return { ok: false, reason: "in_use" };
  }
  db.delete(categories).where(eq(categories.id, id)).run();
  return { ok: true };
}
