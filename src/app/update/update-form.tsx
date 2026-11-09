"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { centsToDecimalInput } from "@/lib/money";
import { updateBalancesAction, type UpdateBalancesState } from "./actions";

type EntityRow = {
  id: number;
  name: string;
  typeLabel: string;
  isCash: boolean;
  latestCents: number | null;
  latestDate: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save balances"}
    </button>
  );
}

function AmountInput({
  id,
  name,
  defaultValue,
  error,
}: {
  id: string;
  name: string;
  defaultValue: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-36 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function UpdateForm({
  assets,
  liabilities,
  currency,
  defaultDate,
}: {
  assets: EntityRow[];
  liabilities: EntityRow[];
  currency: string;
  defaultDate: string;
}) {
  const [state, dispatch] = useActionState<UpdateBalancesState, FormData>(
    updateBalancesAction,
    null,
  );

  const errors = state?.errors ?? {};
  const values = state?.values ?? {};

  const dateValue = values.recordedOn ?? defaultDate;

  return (
    <form action={dispatch} className="flex flex-col gap-8">
      <input type="hidden" name="assetIds" value={assets.map((a) => a.id).join(",")} />
      <input type="hidden" name="liabilityIds" value={liabilities.map((l) => l.id).join(",")} />

      {/* Date */}
      <div className="flex flex-col gap-1">
        <label htmlFor="recordedOn" className="text-sm font-medium text-stone-800">
          Date
        </label>
        <input
          id="recordedOn"
          name="recordedOn"
          type="date"
          required
          defaultValue={dateValue}
          key={dateValue}
          aria-invalid={errors.recordedOn ? true : undefined}
          aria-describedby={errors.recordedOn ? "date-error" : undefined}
          className="w-48 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {errors.recordedOn && (
          <p id="date-error" role="alert" className="text-sm text-red-700">
            {errors.recordedOn}
          </p>
        )}
      </div>

      {/* Assets */}
      {assets.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-stone-900">Assets</h2>
          <div className="flex flex-col divide-y divide-stone-100 rounded-lg border border-stone-200">
            {assets.map((asset) => {
              const key = `asset_${asset.id}`;
              const prefill =
                values[key] ??
                (asset.latestCents !== null ? centsToDecimalInput(asset.latestCents) : "");
              return (
                <div
                  key={asset.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-stone-900">{asset.name}</span>
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                        {asset.typeLabel}
                      </span>
                      {asset.isCash && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                          Cash
                        </span>
                      )}
                    </div>
                    {asset.latestDate ? (
                      <span className="text-xs text-stone-500">
                        Last updated {asset.latestDate}
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">No snapshot yet</span>
                    )}
                    {asset.isCash && (
                      <span className="text-xs text-stone-400">
                        Linked journal entries will be frozen after a newer snapshot
                      </span>
                    )}
                  </div>
                  <AmountInput
                    id={key}
                    name={key}
                    defaultValue={prefill}
                    error={errors[key]}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Liabilities */}
      {liabilities.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-stone-900">Liabilities</h2>
          <div className="flex flex-col divide-y divide-stone-100 rounded-lg border border-stone-200">
            {liabilities.map((liability) => {
              const key = `liability_${liability.id}`;
              const prefill =
                values[key] ??
                (liability.latestCents !== null
                  ? centsToDecimalInput(liability.latestCents)
                  : "");
              return (
                <div
                  key={liability.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-stone-900">
                        {liability.name}
                      </span>
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                        {liability.typeLabel}
                      </span>
                    </div>
                    {liability.latestDate ? (
                      <span className="text-xs text-stone-500">
                        Last updated {liability.latestDate}
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">No snapshot yet</span>
                    )}
                  </div>
                  <AmountInput
                    id={key}
                    name={key}
                    defaultValue={prefill}
                    error={errors[key]}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {assets.length === 0 && liabilities.length === 0 && (
        <p className="text-sm text-stone-500">
          No assets or liabilities yet. Add some from the Assets or Liabilities pages.
        </p>
      )}

      {(assets.length > 0 || liabilities.length > 0) && (
        <div className="flex items-center gap-4">
          <SubmitButton />
          <p className="text-xs text-stone-500">
            Rows with unchanged values are skipped.
          </p>
        </div>
      )}
    </form>
  );
}
