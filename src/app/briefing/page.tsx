import Link from "next/link";
import { redirect } from "next/navigation";
import { loadBriefing, type PropertyOrVehicleInMix } from "@/ai/tasks/briefing";
import type { AllocationPercents } from "@/domain/allocation";
import { formatMoney } from "@/lib/money";
import { BRIEFING_DISCLAIMER } from "@/ai/prompts/briefing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKETS: { key: keyof AllocationPercents; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "bonds", label: "Bonds" },
  { key: "equities", label: "Equities" },
  { key: "other", label: "Other" },
];

export default async function BriefingPage() {
  const briefing = await loadBriefing();
  if (!briefing) redirect("/personality");

  const { decision, currency, narration, propertyOrVehiclesInMix } = briefing;
  const badge = narration.source === "fallback" ? "Template" : "AI";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Briefing</h1>
          <span className="inline-flex rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs font-medium text-stone-700">
            {badge}
          </span>
        </div>
        <p className="mt-2 text-lg text-stone-900">{narration.output.headline}</p>
      </header>

      <div className="mt-6 flex flex-col gap-6">
        {narration.refusalReason ? (
          <p className="text-sm text-stone-700">{narration.refusalReason}</p>
        ) : null}

        {narration.output.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            <p className="mt-2 text-sm text-stone-700">{section.body}</p>
          </section>
        ))}

        {decision.emergencyGapCents > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
            Build emergency fund first
          </p>
        ) : null}

        {decision.shortGoalRemainingCents > 0 ? (
          <p className="text-sm text-stone-800">
            Short-term goals still need{" "}
            {formatMoney(decision.shortGoalRemainingCents, currency)} kept in
            cash-like holdings.
          </p>
        ) : null}

        <PropertyInMixNotice holdings={propertyOrVehiclesInMix} />

        <section>
          <h2 className="text-lg font-semibold">Target and current mix</h2>
          <p className="mt-1 text-sm text-stone-600">
            Percentages come from your profile band and asset snapshots.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            {BUCKETS.map((bucket) => (
              <MixRow
                key={bucket.key}
                label={bucket.label}
                current={decision.currentMixPercent[bucket.key]}
                target={decision.targetBand[bucket.key]}
              />
            ))}
          </div>
        </section>

        <footer className="border-t border-stone-200 pt-4">
          <p className="text-sm text-stone-600">{BRIEFING_DISCLAIMER}</p>
        </footer>
      </div>
    </div>
  );
}

function PropertyInMixNotice({
  holdings,
}: {
  holdings: PropertyOrVehicleInMix[];
}) {
  if (holdings.length === 0) return null;
  const hasProperty = holdings.some((holding) => holding.type === "real_estate");
  const hasVehicle = holdings.some((holding) => holding.type === "vehicle");
  const kind =
    hasProperty && hasVehicle
      ? "property and vehicles"
      : hasProperty
        ? "property"
        : "vehicles";

  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <p>
        This mix includes {kind}. The allocation band is for investable money.
        Open the asset to turn off Include in allocation.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {holdings.map((holding) => (
          <li key={holding.id}>
            <Link
              href={`/assets/${holding.id}`}
              className="font-medium underline decoration-amber-800/40 underline-offset-2 hover:text-amber-900"
            >
              {holding.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MixRow({
  label,
  current,
  target,
}: {
  label: string;
  current: number;
  target: number;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-4 text-sm">
        <span className="font-medium text-stone-800">{label}</span>
        <span className="text-stone-700">
          Current {current}% · Target {target}%
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="h-2 rounded bg-stone-200">
          <div
            className="h-2 rounded bg-teal-700"
            style={{ width: `${Math.min(100, Math.max(0, current))}%` }}
          />
        </div>
        <div className="h-2 rounded bg-stone-200">
          <div
            className="h-2 rounded bg-stone-500"
            style={{ width: `${Math.min(100, Math.max(0, target))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
