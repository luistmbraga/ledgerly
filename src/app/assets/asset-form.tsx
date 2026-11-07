"use client";

import {
  ALLOCATION_SLEEVES,
  defaultIncludeInAllocation,
  defaultSleevePercents,
  type AllocationPercents,
  type AllocationSleeve,
} from "@/domain/allocation";
import { ASSET_TYPES, type AssetType } from "@/domain/net-worth";
import { useState } from "react";
import { ASSET_TYPE_DESCRIPTIONS, ASSET_TYPE_LABELS } from "./labels";

const SLEEVE_LABELS: Record<AllocationSleeve, string> = {
  cash: "Cash",
  bonds: "Bonds",
  equities: "Equities",
  other: "Other",
};

type AssetFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  id?: number;
  defaults?: {
    name: string;
    type: AssetType;
    isLiquid: boolean;
    includeInAllocation: boolean;
    sleevePercents: AllocationPercents;
    notes: string;
  };
};

export function AssetForm({
  action,
  submitLabel,
  id,
  defaults,
}: AssetFormProps) {
  const initialType = defaults?.type ?? "cash";
  const [type, setType] = useState<AssetType>(initialType);
  const [isLiquid, setIsLiquid] = useState(
    defaults?.isLiquid ?? initialType === "cash",
  );
  const [includeInAllocation, setIncludeInAllocation] = useState(
    defaults?.includeInAllocation ?? defaultIncludeInAllocation(initialType),
  );
  const [sleevePercents, setSleevePercents] = useState<AllocationPercents>(
    defaults?.sleevePercents ?? defaultSleevePercents(initialType),
  );
  const [lockLiquidDefault, setLockLiquidDefault] = useState(
    defaults !== undefined,
  );
  const [lockIncludeDefault, setLockIncludeDefault] = useState(
    defaults !== undefined,
  );
  const [lockSleeveDefault, setLockSleeveDefault] = useState(
    defaults !== undefined,
  );

  const sleeveSum = ALLOCATION_SLEEVES.reduce(
    (sum, sleeve) => sum + (Number.isFinite(sleevePercents[sleeve]) ? sleevePercents[sleeve] : 0),
    0,
  );
  const showSplitNote = type === "brokerage" || type === "retirement";

  return (
    <form action={action} className="flex flex-col gap-4">
      {id !== undefined ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId(id, "name")} className="text-sm font-medium">
          Name
        </label>
        <input
          id={fieldId(id, "name")}
          name="name"
          type="text"
          required
          maxLength={200}
          defaultValue={defaults?.name ?? ""}
          autoComplete="off"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId(id, "type")} className="text-sm font-medium">
          Type
        </label>
        <select
          id={fieldId(id, "type")}
          name="type"
          value={type}
          onChange={(event) => {
            const next = event.target.value as AssetType;
            setType(next);
            if (!lockLiquidDefault) setIsLiquid(next === "cash");
            if (!lockIncludeDefault) {
              setIncludeInAllocation(defaultIncludeInAllocation(next));
            }
            if (!lockSleeveDefault) setSleevePercents(defaultSleevePercents(next));
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        >
          {ASSET_TYPES.map((assetType) => (
            <option key={assetType} value={assetType}>
              {ASSET_TYPE_LABELS[assetType]}
            </option>
          ))}
        </select>
        <p className="text-sm text-stone-600">
          {ASSET_TYPE_DESCRIPTIONS[type]}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId(id, "notes")} className="text-sm font-medium">
          Notes
        </label>
        <textarea
          id={fieldId(id, "notes")}
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={defaults?.notes ?? ""}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        />
      </div>
      <label className="flex items-start gap-2 text-sm text-stone-800">
        <input
          type="checkbox"
          name="isLiquid"
          value="1"
          checked={isLiquid}
          onChange={(event) => {
            setLockLiquidDefault(true);
            setIsLiquid(event.target.checked);
          }}
          className="mt-0.5"
        />
        <span>
          Liquid (emergency fund)
          <span className="mt-0.5 block text-stone-600">
            Counts toward the emergency fund. Suggested for cash.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-stone-800">
        <input
          type="checkbox"
          name="includeInAllocation"
          value="1"
          checked={includeInAllocation}
          onChange={(event) => {
            setLockIncludeDefault(true);
            setIncludeInAllocation(event.target.checked);
          }}
          className="mt-0.5"
        />
        <span>
          Count in investment mix
          <span className="mt-0.5 block text-stone-600">
            Property, vehicles, receivables, and businesses start excluded.
          </span>
        </span>
      </label>
      {includeInAllocation ? (
        type === "cash" ? (
          <>
            <p className="text-sm text-stone-600">
              Cash assets stay in the cash sleeve at 100%.
            </p>
            <SleeveHiddenInputs percents={{ cash: 100, bonds: 0, equities: 0, other: 0 }} />
          </>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Allocation mix</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ALLOCATION_SLEEVES.map((sleeve) => (
                <div key={sleeve} className="flex flex-col gap-1">
                  <label
                    htmlFor={fieldId(id, `${sleeve}Pct`)}
                    className="text-sm text-stone-700"
                  >
                    {SLEEVE_LABELS[sleeve]} %
                  </label>
                  <input
                    id={fieldId(id, `${sleeve}Pct`)}
                    name={`${sleeve}Pct`}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    required
                    value={sleevePercents[sleeve]}
                    onChange={(event) => {
                      setLockSleeveDefault(true);
                      const next = Number(event.target.value);
                      setSleevePercents((prev) => ({
                        ...prev,
                        [sleeve]: Number.isFinite(next) ? next : 0,
                      }));
                    }}
                    className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              ))}
            </div>
            <p
              className={
                sleeveSum === 100
                  ? "text-sm text-stone-600"
                  : "text-sm text-amber-800"
              }
            >
              {showSplitNote
                ? "Split a mixed account across sleeves, for example 60% equities and 40% bonds. "
                : null}
              Percents must be whole numbers that sum to 100
              {sleeveSum === 100 ? "." : ` (now ${sleeveSum}).`}
            </p>
          </fieldset>
        )
      ) : (
        <SleeveHiddenInputs percents={sleevePercents} />
      )}
      <button
        type="submit"
        className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
      >
        {submitLabel}
      </button>
    </form>
  );
}

function SleeveHiddenInputs({ percents }: { percents: AllocationPercents }) {
  return (
    <>
      {ALLOCATION_SLEEVES.map((sleeve) => (
        <input
          key={sleeve}
          type="hidden"
          name={`${sleeve}Pct`}
          value={percents[sleeve]}
        />
      ))}
    </>
  );
}

function fieldId(id: number | undefined, name: string) {
  return id === undefined ? `asset-${name}` : `asset-${id}-${name}`;
}
