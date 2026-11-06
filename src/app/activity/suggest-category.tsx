"use client";

import { useState } from "react";
import { suggestExpenseCategory } from "./actions";

type Suggestion = {
  categoryId: number | null;
  categoryName: string | null;
  rationale: string;
  source: "ai" | "cache" | "fallback";
  refusalReason?: string;
};

export function SuggestCategory({
  idPrefix,
  expenseId,
}: {
  idPrefix: string;
  expenseId: number | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  async function onSuggest() {
    setPending(true);
    setError(null);
    const amount = fieldValue(`${idPrefix}-amount`);
    const occurredOn = fieldValue(`${idPrefix}-date`);
    const note = fieldValue(`${idPrefix}-note`);
    const result = await suggestExpenseCategory({
      expenseId,
      amount,
      occurredOn,
      note,
    });
    setPending(false);
    if (!result.ok) {
      setSuggestion(null);
      setError(result.error);
      return;
    }
    setSuggestion({
      categoryId: result.categoryId,
      categoryName: result.categoryName,
      rationale: result.rationale,
      source: result.source,
      refusalReason: result.refusalReason,
    });
  }

  function useSuggestion() {
    if (!suggestion || suggestion.categoryId === null) return;
    const select = document.getElementById(
      `${idPrefix}-category`,
    ) as HTMLSelectElement | null;
    if (!select) return;
    select.value = String(suggestion.categoryId);
  }

  const badge =
    suggestion === null
      ? null
      : suggestion.source === "fallback"
        ? "Template"
        : "AI";

  return (
    <div className="mt-2 flex flex-col gap-2">
      <button
        type="button"
        onClick={onSuggest}
        disabled={pending}
        className="w-fit rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 disabled:opacity-60"
      >
        {pending ? "Suggesting…" : "Suggest"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {suggestion ? (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-stone-800">{suggestion.rationale}</p>
            {badge ? (
              <span className="inline-flex rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs font-medium text-stone-700">
                {badge}
              </span>
            ) : null}
          </div>
          {suggestion.refusalReason ? (
            <p className="mt-1 text-sm text-stone-700">{suggestion.refusalReason}</p>
          ) : null}
          {suggestion.categoryId !== null && suggestion.categoryName ? (
            <button
              type="button"
              onClick={useSuggestion}
              className="mt-2 w-fit rounded-md bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Use {suggestion.categoryName}
            </button>
          ) : null}
          <p className="mt-2 text-xs text-stone-600">
            Confirm the category, then save the expense.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function fieldValue(id: string): string {
  const element = document.getElementById(id);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  return "";
}
