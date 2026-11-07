import {
  recentCategoryLabels,
  suggestCategoryFallback,
  type SuggestExpense,
} from "@/domain/category-suggest";
import { categorySuggestFallback } from "../fallbacks";
import {
  CATEGORY_SUGGEST_INSTRUCTIONS,
  CATEGORY_SUGGEST_VERSION,
} from "../prompts/category-suggest";
import { runAiTask, type TaskDeps, type TaskResult } from "../run-task";
import {
  categorySuggestSchema,
  categorySuggestSchemaForIds,
} from "../schemas";
import { numbersMissingFromInput } from "../validate";
import type { CategorySuggestOutput } from "../fallbacks";

export type CategorySuggestRequest = {
  expenseId: number | null;
  amountCents: number;
  occurredOn: string;
  note: string;
  categories: { id: number; name: string; isEssential: boolean }[];
  recentExpenses: readonly SuggestExpense[];
};

function contractInput(request: CategorySuggestRequest) {
  const note = request.note.slice(0, 500);
  return {
    task: "category_suggest" as const,
    promptVersion: CATEGORY_SUGGEST_VERSION,
    expense: {
      note,
    },
    categories: request.categories.map((category) => ({
      id: category.id,
      name: category.name,
      isEssential: category.isEssential,
    })),
    recentLabels: recentCategoryLabels(
      request.recentExpenses,
      request.occurredOn,
    ),
  };
}

function quotableFrom(input: ReturnType<typeof contractInput>): string[] {
  return [input.expense.note];
}

export async function suggestCategory(
  request: CategorySuggestRequest,
  deps?: TaskDeps,
): Promise<TaskResult<CategorySuggestOutput>> {
  const input = contractInput(request);
  const allowedIds = new Set(request.categories.map((category) => category.id));
  const quotable = quotableFrom(input);
  return runAiTask({
    task: "category_suggest",
    entityId: request.expenseId === null ? "draft" : String(request.expenseId),
    promptVersion: CATEGORY_SUGGEST_VERSION,
    instructions: CATEGORY_SUGGEST_INSTRUCTIONS,
    schemaName: "category_suggest",
    jsonSchema: categorySuggestSchemaForIds(
      request.categories.map((category) => category.id),
    ),
    zodSchema: categorySuggestSchema,
    input,
    deps,
    temperature: 0,
    maxTokens: 200,
    fallback: () =>
      categorySuggestFallback(
        suggestCategoryFallback({
          note: request.note,
          asOf: request.occurredOn,
          categories: request.categories,
          recentExpenses: request.recentExpenses,
        }),
      ),
    accept: (value) => {
      if (value.categoryId !== null && !allowedIds.has(value.categoryId)) {
        return false;
      }
      return numbersMissingFromInput(quotable, value).length === 0;
    },
  });
}
