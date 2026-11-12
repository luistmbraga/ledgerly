import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatBps } from "@/lib/percent";
import type { WhatIfLiability } from "./load";
import type { WhatIfField, WhatIfFormValues, WhatIfMode } from "./parse-params";

const INPUT_CLASS =
  "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400";

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-stone-800">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-stone-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ChangeField({
  id,
  label,
  hint,
  value,
  mode,
  error,
  percentAvailable,
}: {
  id: "income" | "spend";
  label: string;
  hint: string;
  value: string;
  mode: WhatIfMode;
  error?: string;
  percentAvailable: boolean;
}) {
  return (
    <Field id={`what-if-${id}`} label={label} hint={hint} error={error}>
      <div className="flex gap-2">
        <input
          id={`what-if-${id}`}
          name={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="0"
          defaultValue={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `what-if-${id}-error` : `what-if-${id}-hint`}
          className={INPUT_CLASS}
        />
        <select
          name={`${id}Mode`}
          aria-label={`${label} unit`}
          defaultValue={percentAvailable ? mode : "amt"}
          className="rounded-md border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        >
          <option value="amt">per month</option>
          <option value="pct" disabled={!percentAvailable}>
            %
          </option>
        </select>
      </div>
    </Field>
  );
}

export function WhatIfForm({
  values,
  errors,
  currency,
  percentAvailable,
  liabilities,
}: {
  values: WhatIfFormValues;
  errors: Partial<Record<WhatIfField, string>>;
  currency: string;
  percentAvailable: boolean;
  liabilities: readonly WhatIfLiability[];
}) {
  const payable = liabilities.filter((liability) => liability.balanceCents > 0);

  return (
    <form method="get" action="/what-if" className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <ChangeField
          id="income"
          label="Monthly income change"
          hint="Use a minus sign for a drop."
          value={values.income}
          mode={values.incomeMode}
          error={errors.income}
          percentAvailable={percentAvailable}
        />
        <ChangeField
          id="spend"
          label="Monthly spending change"
          hint="Use a minus sign for a cut."
          value={values.spend}
          mode={values.spendMode}
          error={errors.spend}
          percentAvailable={percentAvailable}
        />
        <Field
          id="what-if-oneoff"
          label="One-off amount"
          hint="Windfall as a plus, purchase as a minus. Treated as liquid cash."
          error={errors.oneoff}
        >
          <input
            id="what-if-oneoff"
            name="oneoff"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="0"
            defaultValue={values.oneoff}
            aria-invalid={errors.oneoff ? true : undefined}
            aria-describedby={errors.oneoff ? "what-if-oneoff-error" : "what-if-oneoff-hint"}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      {!percentAvailable ? (
        <p className="text-xs text-stone-500">
          Percent changes need three full months of journal entries, so only
          monthly amounts are available for now.
        </p>
      ) : null}

      {payable.length > 0 ? (
        <fieldset className="flex flex-col gap-3 border-t border-stone-200 pt-4">
          <legend className="text-sm font-semibold text-stone-800">
            Extra debt payment
          </legend>
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="what-if-debt" label="Liability" error={errors.debt}>
              <select
                id="what-if-debt"
                name="debt"
                defaultValue={values.debt}
                aria-invalid={errors.debt ? true : undefined}
                aria-describedby={errors.debt ? "what-if-debt-error" : undefined}
                className={INPUT_CLASS}
              >
                <option value="">None</option>
                {payable.map((liability) => (
                  <option key={liability.id} value={liability.id}>
                    {liability.name} ({formatMoney(liability.balanceCents, currency)}
                    {liability.annualRateBps !== null
                      ? ` · ${formatBps(liability.annualRateBps)}`
                      : ""}
                    )
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="what-if-extra"
              label="Extra per month"
              hint="On top of what you already pay."
              error={errors.extra}
            >
              <input
                id="what-if-extra"
                name="extra"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                defaultValue={values.extra}
                aria-invalid={errors.extra ? true : undefined}
                aria-describedby={errors.extra ? "what-if-extra-error" : "what-if-extra-hint"}
                className={INPUT_CLASS}
              />
            </Field>
            <Field
              id="what-if-rate"
              label="Annual interest rate (%)"
              hint="Blank uses the liability's saved rate, if any. A rate typed here is not saved."
              error={errors.rate}
            >
              <input
                id="what-if-rate"
                name="rate"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="3.5"
                defaultValue={values.rate}
                aria-invalid={errors.rate ? true : undefined}
                aria-describedby={errors.rate ? "what-if-rate-error" : "what-if-rate-hint"}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
        >
          Run what-if
        </button>
        <Link
          href="/what-if"
          className="text-sm font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}
