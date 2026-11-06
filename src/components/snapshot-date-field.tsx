"use client";

import { formatMoney } from "@/lib/money";
import { useState } from "react";

type DatedAmount = {
  id: number;
  recordedOn: string;
  amountCents: number;
};

export function SnapshotDateField({
  snapshots,
  currency,
  defaultDate,
}: {
  snapshots: DatedAmount[];
  currency: string;
  defaultDate: string;
}) {
  const [recordedOn, setRecordedOn] = useState(defaultDate);
  const replaced = snapshots.reduce<DatedAmount | null>((current, snapshot) => {
    if (snapshot.recordedOn !== recordedOn) return current;
    if (current === null || snapshot.id > current.id) return snapshot;
    return current;
  }, null);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="recordedOn" className="text-sm font-medium">
        Date
      </label>
      <input
        id="recordedOn"
        name="recordedOn"
        type="date"
        required
        value={recordedOn}
        onChange={(event) => setRecordedOn(event.target.value)}
        className="w-48 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
      />
      {replaced ? (
        <p role="status" className="text-sm text-amber-950">
          A snapshot on this date is already{" "}
          {formatMoney(replaced.amountCents, currency)}. Saving a new amount
          replaces it as the current value for that date.
        </p>
      ) : null}
    </div>
  );
}
