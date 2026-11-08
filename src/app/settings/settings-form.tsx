"use client";

import { useActionState } from "react";
import { MoneyInput } from "@/components/money-input";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-state";
import { saveSettingsAction } from "./actions";
import { centsToDecimalInput, formatMoney } from "@/lib/money";

type SettingsFormProps = {
  displayCurrency: string;
  emergencyFundTargetMonths: number;
  essentialMonthlySpendOverrideCents: number | null;
};

export function SettingsForm({
  displayCurrency,
  emergencyFundTargetMonths,
  essentialMonthlySpendOverrideCents,
}: SettingsFormProps) {
  const [state, formAction] = useActionState(saveSettingsAction, null);
  const e = state?.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {e._form ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {e._form}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label
          htmlFor="displayCurrency"
          className="text-sm font-medium text-stone-800"
        >
          Display currency
        </label>
        <input
          id="displayCurrency"
          name="displayCurrency"
          type="text"
          required
          minLength={3}
          maxLength={3}
          pattern="[A-Za-z]{3}"
          autoComplete="off"
          defaultValue={displayCurrency}
          aria-invalid={!!e.displayCurrency}
          aria-describedby={
            e.displayCurrency ? "displayCurrency-error" : "displayCurrency-hint"
          }
          className="w-32 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm uppercase text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.displayCurrency ? (
          <p id="displayCurrency-error" role="alert" className="text-sm text-red-700">
            {e.displayCurrency}
          </p>
        ) : (
          <p id="displayCurrency-hint" className="text-sm text-amber-800">
            Does not convert existing amounts. One display currency is used for
            every figure (default EUR).
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="emergencyFundTargetMonths"
          className="text-sm font-medium text-stone-800"
        >
          Emergency fund target months
        </label>
        <input
          id="emergencyFundTargetMonths"
          name="emergencyFundTargetMonths"
          type="number"
          required
          min={1}
          max={24}
          step={1}
          defaultValue={emergencyFundTargetMonths}
          aria-invalid={!!e.emergencyFundTargetMonths}
          aria-describedby={
            e.emergencyFundTargetMonths ? "emergencyFundTargetMonths-error" : undefined
          }
          className="w-32 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.emergencyFundTargetMonths ? (
          <p
            id="emergencyFundTargetMonths-error"
            role="alert"
            className="text-sm text-red-700"
          >
            {e.emergencyFundTargetMonths}
          </p>
        ) : null}
      </div>

      <MoneyInput
        id="essentialMonthlySpendOverride"
        name="essentialMonthlySpendOverride"
        label="Essential monthly spend override"
        defaultValue={
          essentialMonthlySpendOverrideCents === null
            ? ""
            : centsToDecimalInput(essentialMonthlySpendOverrideCents)
        }
        hint={
          essentialMonthlySpendOverrideCents === null
            ? "Optional. Leave blank to clear. Example: 1500.00."
            : `Optional. Current value ${formatMoney(essentialMonthlySpendOverrideCents, displayCurrency)}. Leave blank to clear.`
        }
        error={e.essentialMonthlySpendOverride}
      />

      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
