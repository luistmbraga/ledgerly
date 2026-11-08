"use client";

import { useActionState } from "react";
import { MoneyInput } from "./money-input";
import { SnapshotDateField } from "./snapshot-date-field";
import { SubmitButton } from "./submit-button";
import type { ActionState } from "@/lib/action-state";

type DatedAmount = {
  id: number;
  recordedOn: string;
  amountCents: number;
};

type SnapshotFormProps = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  snapshots: DatedAmount[];
  currency: string;
  defaultDate: string;
  amountLabel: string;
  amountHint?: string;
  submitLabel: string;
  cancelHref?: string;
  hiddenFields: Record<string, string | number>;
  defaults?: {
    amount: string;
    note: string;
  };
};

export function SnapshotForm({
  action,
  snapshots,
  currency,
  defaultDate,
  amountLabel,
  amountHint,
  submitLabel,
  cancelHref,
  hiddenFields,
  defaults,
}: SnapshotFormProps) {
  const [state, formAction] = useActionState(action, null);
  const e = state?.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {e._form ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {e._form}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <SnapshotDateField
          snapshots={snapshots}
          currency={currency}
          defaultDate={defaultDate}
        />
        {e.recordedOn ? (
          <p role="alert" className="text-sm text-red-700">
            {e.recordedOn}
          </p>
        ) : null}
      </div>

      <MoneyInput
        id="amount"
        name="amount"
        label={amountLabel}
        defaultValue={defaults?.amount ?? ""}
        hint={amountHint}
        error={e.amount}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="note" className="text-sm font-medium">
          Note
        </label>
        <input
          id="note"
          name="note"
          type="text"
          maxLength={500}
          autoComplete="off"
          defaultValue={defaults?.note ?? ""}
          aria-invalid={!!e.note}
          aria-describedby={e.note ? "note-error" : undefined}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.note ? (
          <p id="note-error" role="alert" className="text-sm text-red-700">
            {e.note}
          </p>
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
