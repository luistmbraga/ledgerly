import type { GoalStatus, HorizonBucket } from "@/domain/goals";
import { ratioToVisualPercent } from "@/lib/percent";
import { BUCKET_LABELS, STATUS_LABELS } from "./labels";

const STATUS_CLASS: Record<GoalStatus, string> = {
  on_track: "border-teal-200 bg-teal-50 text-teal-900",
  tight: "border-amber-200 bg-amber-50 text-amber-950",
  shortfall: "border-red-200 bg-red-50 text-red-800",
};

export function BucketBadge({ bucket }: { bucket: HorizonBucket }) {
  return (
    <span className="inline-flex rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-800">
      {BUCKET_LABELS[bucket]}
    </span>
  );
}

export function StatusChip({ status }: { status: GoalStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ProgressBar({
  setAsideCents,
  targetAmountCents,
}: {
  setAsideCents: number;
  targetAmountCents: number;
}) {
  const ratio =
    targetAmountCents > 0
      ? Math.min(1, Math.max(0, setAsideCents / targetAmountCents))
      : 0;
  const percent = ratioToVisualPercent(ratio);

  return (
    <div
      className="h-2 rounded bg-stone-200"
      role="meter"
      aria-label="Set aside toward target"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="h-2 rounded bg-teal-700" style={{ width: `${percent}%` }} />
    </div>
  );
}
