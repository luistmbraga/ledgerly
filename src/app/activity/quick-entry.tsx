"use client";

import { useState } from "react";
import {
  createExpenseAction,
  createIncomeAction,
  parseQuickEntryAction,
  type QuickEntryDraft,
} from "./actions";
import { formatMoney } from "@/lib/money";
import { formatIsoDate } from "../assets/labels";

export function QuickEntry({
  currency,
  hasCategories,
}: {
  currency: string;
  hasCategories: boolean;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuickEntryDraft | null>(null);

  async function onParse(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setPending(true);
    setError(null);
    setDraft(null);
    const result = await parseQuickEntryAction({ text });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(result.draft);
  }

  function onEdit() {
    setDraft(null);
  }

  return (
    <section className="border-b border-stone-200 pb-6">
      <h2 className="text-base font-semibold text-stone-900">Quick entry</h2>
      <p className="mt-0.5 text-sm text-stone-600">
        Describe a transaction in plain language and confirm the draft.
      </p>

      {!draft ? (
        <form onSubmit={onParse} className="mt-3 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={hasCategories ? "e.g. spent 42 on groceries yesterday" : "e.g. spent 42 yesterday"}
            disabled={pending}
            className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-700 disabled:opacity-60"
            aria-label="Quick entry text"
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 disabled:opacity-60"
          >
            {pending ? "Parsing…" : "Parse"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {draft ? (
        <DraftCard
          draft={draft}
          currency={currency}
          onEdit={onEdit}
        />
      ) : null}
    </section>
  );
}

function DraftCard({
  draft,
  currency,
  onEdit,
}: {
  draft: QuickEntryDraft;
  currency: string;
  onEdit: () => void;
}) {
  const badge = draft.source === "fallback" ? null : draft.source === "cache" ? "AI (cached)" : "AI";

  return (
    <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize text-stone-900">{draft.kind}</span>
          {badge ? (
            <span className="inline-flex rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs font-medium text-stone-600">
              {badge}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-sm text-stone-600 underline hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        >
          Edit
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-stone-500">Amount</dt>
          <dd className="font-medium text-stone-900">{formatMoney(draft.amountCents, currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Date</dt>
          <dd className="font-medium text-stone-900">{formatIsoDate(draft.occurredOn)}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Category</dt>
          <dd className="font-medium text-stone-900">{draft.categoryName ?? "Uncategorized"}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Note</dt>
          <dd className="font-medium text-stone-900">{draft.note || "—"}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-stone-500">
        Review the details above, then confirm to save. Nothing is saved until you confirm.
      </p>

      <ConfirmForm draft={draft} />
    </div>
  );
}

function ConfirmForm({ draft }: { draft: QuickEntryDraft }) {
  const action = draft.kind === "expense" ? createExpenseAction : createIncomeAction;
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action={async (formData) => {
        setSubmitting(true);
        await action(null, formData);
      }}
      className="mt-3"
    >
      <input type="hidden" name="amount" value={draft.amountRaw} />
      <input type="hidden" name="occurredOn" value={draft.occurredOn} />
      <input type="hidden" name="categoryId" value={draft.categoryId === null ? "" : String(draft.categoryId)} />
      <input type="hidden" name="assetId" value="" />
      <input type="hidden" name="note" value={draft.note} />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 disabled:opacity-60"
      >
        {submitting ? "Saving…" : `Confirm ${draft.kind}`}
      </button>
    </form>
  );
}
