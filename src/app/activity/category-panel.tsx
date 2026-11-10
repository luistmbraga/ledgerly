"use client";

import { useActionState } from "react";
import type { CategoryKind, CategoryRecord } from "@/db/repositories/categories";
import type { ActionState } from "@/lib/action-state";
import { centsToDecimalInput, formatMoney } from "@/lib/money";
import { SubmitButton } from "@/components/submit-button";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "./actions";
import { ConfirmDelete } from "@/components/confirm-delete";

type CategoryPanelProps = {
  kind: CategoryKind;
  categories: CategoryRecord[];
  /** MTD spend in cents keyed by categoryId (expense tab only). */
  mtdSpend?: Record<number, number>;
  currency?: string;
};

function MtdBar({
  budgetCents,
  spentCents,
  currency,
}: {
  budgetCents: number;
  spentCents: number;
  currency: string;
}) {
  const ratio = Math.min(spentCents / budgetCents, 1);
  const pct = Math.round(ratio * 100);
  const isOver = spentCents > budgetCents;
  const isWarning = !isOver && ratio >= 0.8;
  const barColor = isOver
    ? "bg-red-500"
    : isWarning
      ? "bg-amber-400"
      : "bg-teal-500";

  return (
    <div className="mt-1.5 w-40">
      <div className="flex justify-between text-xs text-stone-500 mb-0.5">
        <span>{formatMoney(spentCents, currency)}</span>
        <span>of {formatMoney(budgetCents, currency)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-stone-200">
        <div
          className={`h-1.5 rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isOver && (
        <p className="mt-0.5 text-xs text-red-600">Over by {formatMoney(spentCents - budgetCents, currency)}</p>
      )}
    </div>
  );
}

function CategoryUpdateForm({
  category,
  kind,
  mtdSpend,
  currency,
}: {
  category: CategoryRecord;
  kind: CategoryKind;
  mtdSpend?: number;
  currency: string;
}) {
  const [state, formAction] = useActionState(updateCategoryAction, null);
  const e = state?.errors ?? {};

  return (
    <div className="flex flex-col gap-2 w-full">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={category.id} />
        <input type="hidden" name="kind" value={kind} />
        <div className="flex flex-col gap-1">
          <input
            aria-label={`${category.name} name`}
            name="name"
            type="text"
            required
            maxLength={80}
            defaultValue={category.name}
            aria-invalid={!!e.name}
            className="w-48 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
          />
          {e.name ? (
            <p role="alert" className="text-sm text-red-700">
              {e.name}
            </p>
          ) : null}
        </div>
        {kind === "expense" ? (
          <label className="flex items-center gap-2 text-sm text-stone-800">
            <input
              type="checkbox"
              name="isEssential"
              value="1"
              defaultChecked={category.isEssential}
            />
            Essential
          </label>
        ) : null}
        {kind === "expense" ? (
          <div className="flex flex-col gap-1">
            <input
              aria-label={`${category.name} monthly budget`}
              name="budgetMonthlyCents"
              type="text"
              inputMode="decimal"
              placeholder="Budget/mo"
              defaultValue={
                category.budgetMonthlyCents != null
                  ? centsToDecimalInput(category.budgetMonthlyCents)
                  : ""
              }
              aria-invalid={!!e.budgetMonthlyCents}
              className="w-28 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
            />
            {e.budgetMonthlyCents ? (
              <p role="alert" className="text-sm text-red-700">
                {e.budgetMonthlyCents}
              </p>
            ) : null}
          </div>
        ) : null}
        {e._form ? (
          <p role="alert" className="text-sm text-red-700">
            {e._form}
          </p>
        ) : null}
        <SubmitButton className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 disabled:opacity-60">
          Save
        </SubmitButton>
      </form>
      {kind === "expense" && category.budgetMonthlyCents != null && category.budgetMonthlyCents > 0 ? (
        <MtdBar
          budgetCents={category.budgetMonthlyCents}
          spentCents={mtdSpend ?? 0}
          currency={currency}
        />
      ) : null}
    </div>
  );
}

function CategoryCreateForm({ kind }: { kind: CategoryKind }) {
  const [state, formAction] = useActionState(createCategoryAction, null);
  const e = state?.errors ?? {};

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`new-${kind}-category`}
          className="text-sm font-medium text-stone-800"
        >
          New category
        </label>
        <input
          id={`new-${kind}-category`}
          name="name"
          type="text"
          required
          maxLength={80}
          aria-invalid={!!e.name}
          className="w-56 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.name ? (
          <p role="alert" className="text-sm text-red-700">
            {e.name}
          </p>
        ) : null}
        {e._form ? (
          <p role="alert" className="text-sm text-red-700">
            {e._form}
          </p>
        ) : null}
      </div>
      {kind === "expense" ? (
        <label className="flex items-center gap-2 pb-2 text-sm text-stone-800">
          <input type="checkbox" name="isEssential" value="1" />
          Essential
        </label>
      ) : null}
      <SubmitButton>Add category</SubmitButton>
    </form>
  );
}

export function CategoryPanel({ kind, categories, mtdSpend, currency = "EUR" }: CategoryPanelProps) {
  return (
    <section className="border-t border-stone-200 pt-6">
      <h2 className="text-lg font-semibold">
        {kind === "expense" ? "Expense categories" : "Income categories"}
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        {kind === "expense"
          ? "Essential categories count toward essential monthly spend. Set a monthly budget to track spending. A category with entries cannot be deleted."
          : "Income categories group money coming in. Essential does not apply. A category with entries cannot be deleted."}
      </p>

      {categories.length === 0 ? (
        <p className="mt-4 text-sm text-stone-700">No categories yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {categories.map((category) => {
            const tab = kind === "income" ? "income" : "expenses";
            return (
              <div
                key={category.id}
                className="flex flex-wrap items-start gap-4 border-b border-stone-100 pb-3"
              >
                <div className="flex-1 min-w-0">
                  <CategoryUpdateForm
                    category={category}
                    kind={kind}
                    mtdSpend={mtdSpend?.[category.id]}
                    currency={currency}
                  />
                </div>
                <div className="pt-1">
                  <ConfirmDelete
                    action={deleteCategoryAction}
                    id={category.id}
                    dialogKey={`category-${category.id}`}
                    hiddenFields={{ tab }}
                    title={`Delete ${category.name}?`}
                    body="This removes the category. Categories that already have expenses or income stay in place."
                    triggerLabel="Delete"
                    size="sm"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CategoryCreateForm kind={kind} />
    </section>
  );
}
