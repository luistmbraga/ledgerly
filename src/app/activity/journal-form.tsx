"use client";

import { useActionState } from "react";
import { MoneyInput } from "@/components/money-input";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-state";
import { SuggestCategory } from "./suggest-category";

type CategoryOption = {
  id: number;
  name: string;
};

type CashAccountOption = {
  id: number;
  name: string;
};

type JournalFormProps = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  idPrefix: string;
  submitLabel: string;
  categories: CategoryOption[];
  cashAccounts: CashAccountOption[];
  cancelHref?: string;
  entryId?: number;
  suggestExpenseId?: number | null;
  defaults?: {
    amount: string;
    occurredOn: string;
    categoryId: number | null;
    assetId: number | null;
    note: string;
  };
};

export function JournalForm({
  action,
  idPrefix,
  submitLabel,
  categories,
  cashAccounts,
  cancelHref,
  entryId,
  suggestExpenseId,
  defaults,
}: JournalFormProps) {
  const [state, formAction] = useActionState(action, null);
  const e = state?.errors ?? {};

  const amountId = `${idPrefix}-amount`;
  const dateId = `${idPrefix}-date`;
  const categorySelectId = `${idPrefix}-category`;
  const assetFieldId = `${idPrefix}-asset`;
  const noteId = `${idPrefix}-note`;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {entryId !== undefined ? (
        <input type="hidden" name="id" value={entryId} />
      ) : null}

      {e._form ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {e._form}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={dateId} className="text-sm font-medium text-stone-800">
          Date
        </label>
        <input
          id={dateId}
          name="occurredOn"
          type="date"
          required
          defaultValue={defaults?.occurredOn ?? ""}
          aria-invalid={!!e.occurredOn}
          aria-describedby={e.occurredOn ? `${dateId}-error` : undefined}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.occurredOn ? (
          <p id={`${dateId}-error`} role="alert" className="text-sm text-red-700">
            {e.occurredOn}
          </p>
        ) : null}
      </div>

      <MoneyInput
        id={amountId}
        name="amount"
        label="Amount"
        defaultValue={defaults?.amount ?? ""}
        error={e.amount}
      />

      <div className="flex flex-col gap-1">
        <label
          htmlFor={categorySelectId}
          className="text-sm font-medium text-stone-800"
        >
          Category
        </label>
        <select
          id={categorySelectId}
          name="categoryId"
          defaultValue={
            defaults?.categoryId === null || defaults?.categoryId === undefined
              ? ""
              : String(defaults.categoryId)
          }
          aria-invalid={!!e.categoryId}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        >
          <option value="">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {e.categoryId ? (
          <p role="alert" className="text-sm text-red-700">
            {e.categoryId}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={assetFieldId}
          className="text-sm font-medium text-stone-800"
        >
          Cash account
        </label>
        <select
          id={assetFieldId}
          name="assetId"
          defaultValue={
            defaults?.assetId === null || defaults?.assetId === undefined
              ? ""
              : String(defaults.assetId)
          }
          aria-invalid={!!e.assetId}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        >
          <option value="">None — journal only</option>
          {cashAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {e.assetId ? (
          <p role="alert" className="text-sm text-red-700">
            {e.assetId}
          </p>
        ) : (
          <p className="text-xs text-stone-600">
            Optional. Linking a cash account updates that balance with a new
            snapshot.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={noteId} className="text-sm font-medium text-stone-800">
          Note
        </label>
        <input
          id={noteId}
          name="note"
          type="text"
          maxLength={500}
          defaultValue={defaults?.note ?? ""}
          autoComplete="off"
          aria-invalid={!!e.note}
          aria-describedby={e.note ? `${noteId}-error` : undefined}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.note ? (
          <p id={`${noteId}-error`} role="alert" className="text-sm text-red-700">
            {e.note}
          </p>
        ) : null}
        {suggestExpenseId !== undefined ? (
          <SuggestCategory idPrefix={idPrefix} expenseId={suggestExpenseId} />
        ) : null}
      </div>

      <div className="flex gap-2">
        <SubmitButton>{submitLabel}</SubmitButton>
        {cancelHref ? (
          <a
            href={cancelHref}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
          >
            Cancel
          </a>
        ) : null}
      </div>
    </form>
  );
}
