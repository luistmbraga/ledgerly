"use client";

import { useActionState } from "react";
import { MoneyInput } from "@/components/money-input";
import { SubmitButton } from "@/components/submit-button";
import { centsToDecimalInput } from "@/lib/money";
import { saveEssentialOverrideAction } from "./actions";

type Props = {
  currentOverrideCents: number | null;
  currency: string;
};

export function EssentialOverrideForm({ currentOverrideCents, currency }: Props) {
  const [state, formAction] = useActionState(saveEssentialOverrideAction, null);
  const e = state?.errors ?? {};

  const defaultValue =
    state?.values?.essentialMonthlySpend ??
    (currentOverrideCents !== null
      ? centsToDecimalInput(currentOverrideCents)
      : "");

  const hint =
    currentOverrideCents !== null
      ? `Current: ${currency} ${centsToDecimalInput(currentOverrideCents)}. Leave blank to clear.`
      : "Example: 1500.00. Leave blank to clear.";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {e._form ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {e._form}
        </p>
      ) : null}
      <MoneyInput
        id="essentialMonthlySpend"
        name="essentialMonthlySpend"
        label={
          currentOverrideCents === null
            ? "What do you need per month if income stopped?"
            : "Monthly essential spend"
        }
        defaultValue={defaultValue}
        hint={hint}
        error={e.essentialMonthlySpend}
      />
      <SubmitButton>
        {currentOverrideCents === null ? "Set target" : "Update"}
      </SubmitButton>
    </form>
  );
}
