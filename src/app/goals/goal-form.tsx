"use client";

import { useActionState } from "react";
import { MoneyInput } from "@/components/money-input";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-state";

export type GoalFormDefaults = {
  name: string;
  targetAmount: string;
  targetDate: string;
  setAside: string;
  plannedMonthly: string;
  expectedReturnPercent: string;
};

type GoalFormProps = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  id?: number;
  defaults?: GoalFormDefaults;
};

export function GoalForm({ action, submitLabel, id, defaults }: GoalFormProps) {
  const [state, formAction] = useActionState(action, null);
  const field = (name: string) => (id === undefined ? name : `${name}-${id}`);
  const e = state?.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {id !== undefined ? <input type="hidden" name="id" value={id} /> : null}

      {e._form ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {e._form}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={field("name")} className="text-sm font-medium text-stone-800">
          Name
        </label>
        <input
          id={field("name")}
          name="name"
          type="text"
          required
          maxLength={200}
          defaultValue={defaults?.name ?? ""}
          autoComplete="off"
          aria-invalid={!!e.name}
          aria-describedby={e.name ? `${field("name")}-error` : undefined}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.name ? (
          <p id={`${field("name")}-error`} role="alert" className="text-sm text-red-700">
            {e.name}
          </p>
        ) : null}
      </div>

      <MoneyInput
        id={field("targetAmount")}
        name="targetAmount"
        label="Target amount"
        defaultValue={defaults?.targetAmount ?? ""}
        error={e.targetAmount}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor={field("targetDate")} className="text-sm font-medium text-stone-800">
          Target date
        </label>
        <input
          id={field("targetDate")}
          name="targetDate"
          type="date"
          required
          defaultValue={defaults?.targetDate ?? ""}
          aria-invalid={!!e.targetDate}
          aria-describedby={e.targetDate ? `${field("targetDate")}-error` : undefined}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.targetDate ? (
          <p id={`${field("targetDate")}-error`} role="alert" className="text-sm text-red-700">
            {e.targetDate}
          </p>
        ) : null}
      </div>

      <MoneyInput
        id={field("setAside")}
        name="setAside"
        label="Set aside"
        defaultValue={defaults?.setAside ?? ""}
        hint="Amount already saved toward this goal. Leave blank for zero."
        error={e.setAside}
      />

      <MoneyInput
        id={field("plannedMonthly")}
        name="plannedMonthly"
        label="Planned monthly"
        defaultValue={defaults?.plannedMonthly ?? ""}
        hint="Optional. Leave blank to compare the goal with your recent average surplus."
        error={e.plannedMonthly}
      />

      <div className="flex flex-col gap-1">
        <label
          htmlFor={field("expectedReturn")}
          className="text-sm font-medium text-stone-800"
        >
          Expected return %
        </label>
        <input
          id={field("expectedReturn")}
          name="expectedReturn"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          defaultValue={defaults?.expectedReturnPercent ?? ""}
          aria-invalid={!!e.expectedReturn}
          aria-describedby={
            e.expectedReturn
              ? `${field("expectedReturn")}-error`
              : `${field("expectedReturn")}-hint`
          }
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.expectedReturn ? (
          <p id={`${field("expectedReturn")}-error`} role="alert" className="text-sm text-red-700">
            {e.expectedReturn}
          </p>
        ) : (
          <p id={`${field("expectedReturn")}-hint`} className="text-sm text-stone-600">
            Optional annual percent. A planning assumption, not a guaranteed return.
          </p>
        )}
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
