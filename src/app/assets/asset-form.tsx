"use client";

import {
  ALLOCATION_BUCKETS,
  defaultAllocationBucket,
  defaultIncludeInAllocation,
  type AllocationBucket,
} from "@/domain/allocation";
import { ASSET_TYPES, type AssetType } from "@/domain/net-worth";
import { useState } from "react";
import { ASSET_TYPE_LABELS } from "./labels";

const BUCKET_LABELS: Record<AllocationBucket, string> = {
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
    allocationBucket: AllocationBucket;
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
  const [allocationBucket, setAllocationBucket] = useState<AllocationBucket>(
    defaults?.allocationBucket ?? defaultAllocationBucket(initialType),
  );
  const [lockLiquidDefault, setLockLiquidDefault] = useState(
    defaults !== undefined,
  );
  const [lockIncludeDefault, setLockIncludeDefault] = useState(
    defaults !== undefined,
  );
  const [lockBucketDefault, setLockBucketDefault] = useState(
    defaults !== undefined,
  );

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
            if (!lockBucketDefault) setAllocationBucket(defaultAllocationBucket(next));
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        >
          {ASSET_TYPES.map((assetType) => (
            <option key={assetType} value={assetType}>
              {ASSET_TYPE_LABELS[assetType]}
            </option>
          ))}
        </select>
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
      <div className="flex flex-col gap-1">
        <label
          htmlFor={fieldId(id, "allocationBucket")}
          className="text-sm font-medium"
        >
          Allocation bucket
        </label>
        <select
          id={fieldId(id, "allocationBucket")}
          name="allocationBucket"
          value={allocationBucket}
          onChange={(event) => {
            setLockBucketDefault(true);
            setAllocationBucket(event.target.value as AllocationBucket);
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        >
          {ALLOCATION_BUCKETS.map((bucket) => (
            <option key={bucket} value={bucket}>
              {BUCKET_LABELS[bucket]}
            </option>
          ))}
        </select>
        <p className="text-sm text-stone-600">
          Where this asset sits in the investment mix. Bonds stay out of the
          mix until you choose Bonds.
        </p>
      </div>
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
          Include in allocation
          <span className="mt-0.5 block text-stone-600">
            Count this asset in the investment mix. Property and vehicles start
            excluded.
          </span>
        </span>
      </label>
      <button
        type="submit"
        className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
      >
        {submitLabel}
      </button>
    </form>
  );
}

function fieldId(id: number | undefined, name: string) {
  return id === undefined ? `asset-${name}` : `asset-${id}-${name}`;
}
