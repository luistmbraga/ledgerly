import Link from "next/link";
import { Suspense } from "react";
import { ASSET_TYPES } from "@/domain/net-worth";
import { formatMoney } from "@/lib/money";
import { formatRatio } from "@/lib/percent";
import { todayUtc } from "@/lib/dates";
import { getDashboardSummary } from "@/services/dashboard-summary";
import { getEmergencyFund } from "@/services/emergency-fund-service";
import { narrateDashboardTips } from "@/ai/tasks/tips";
import type { DashboardTip } from "@/services/tips-service";
import { refreshTipsAction } from "./ai-actions";
import { ASSET_TYPE_LABELS } from "./assets/labels";
import { BucketBadge, StatusChip } from "./goals/goal-bits";
import { loadGoals } from "./goals/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DashboardPage() {
  const asOfDate = todayUtc();
  const summary = getDashboardSummary();
  const fund = getEmergencyFund(asOfDate);
  const goals = loadGoals(asOfDate);
  const { netWorth, currency } = summary;
  const hasAssets = summary.assetCount > 0;
  const funded = fund.targetCents > 0 && fund.gapCents === 0;
  const missingEssentialTarget =
    fund.essentialSpendSource === "computed" &&
    fund.essentialMonthlyAverageCents === 0;
  const fundedRatio = fund.fundedRatio;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      {/* Net worth headline — always first per ux.md:44 */}
      {hasAssets ? (
        <header className="border-b border-stone-200 pb-4">
          <p className="text-sm font-medium text-stone-600">Net worth</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">
            {formatMoney(netWorth.netWorthCents, currency)}
          </h1>
          <p className="mt-2 text-sm text-stone-700">
            {formatMoney(netWorth.totalAssetsCents, currency)} assets minus{" "}
            {formatMoney(netWorth.totalLiabilitiesCents, currency)} liabilities
          </p>
        </header>
      ) : (
        <header className="border-b border-stone-200 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-stone-600">
            Net worth from the latest snapshot of each asset and liability.
          </p>
        </header>
      )}

      {!hasAssets && (
        <div className="mt-6 flex flex-col gap-4">
          <p className="text-sm text-stone-700">
            No assets yet. Add your first asset, then record a snapshot to see
            net worth.
          </p>
          <Link
            href="/assets"
            className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
          >
            Add your first asset
          </Link>
          {summary.liabilityCount > 0 ? (
            <p className="text-sm text-stone-700">
              Net worth {formatMoney(netWorth.netWorthCents, currency)} (
              {formatMoney(netWorth.totalAssetsCents, currency)} assets minus{" "}
              {formatMoney(netWorth.totalLiabilitiesCents, currency)}{" "}
              liabilities).
            </p>
          ) : null}
        </div>
      )}

      <section className="mt-6 flex items-center gap-4 rounded-md border border-stone-200 px-4 py-3">
        <ProgressRing ratio={fundedRatio} funded={funded} />
        <div>
          <h2 className="text-sm font-medium text-stone-800">Emergency fund</h2>
          <p className="mt-1 text-sm text-stone-700">
            {missingEssentialTarget ? (
              <>
                No essential-spend target yet. Log essential expenses for the
                last three full months on{" "}
                <Link
                  href="/activity"
                  className="font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
                >
                  Activity
                </Link>{" "}
                or set an override in{" "}
                <Link
                  href="/settings"
                  className="font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
                >
                  Settings
                </Link>
                .
              </>
            ) : funded ? (
              "Funded"
            ) : fund.targetCents === 0 ? (
              "No target yet"
            ) : (
              `Gap ${formatMoney(fund.gapCents, currency)}`
            )}
            {" · "}
            <Link
              href="/emergency-fund"
              className="font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
            >
              View fund
            </Link>
          </p>
        </div>
      </section>

      <GoalsSummary
        goals={goals.goals.slice(0, 3)}
        total={goals.goals.length}
        currency={currency}
      />

      <Suspense fallback={<TipsSkeleton />}>
        <TipsPanelLoader asOfDate={asOfDate} />
      </Suspense>

      {hasAssets && (
        <div className="mt-6 flex flex-col gap-8">
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Assets and liabilities</h2>
            <Bar
              label="Assets"
              cents={netWorth.totalAssetsCents}
              scale={Math.max(
                netWorth.totalAssetsCents,
                netWorth.totalLiabilitiesCents,
              )}
              currency={currency}
              tone="teal"
            />
            <Bar
              label="Liabilities"
              cents={netWorth.totalLiabilitiesCents}
              scale={Math.max(
                netWorth.totalAssetsCents,
                netWorth.totalLiabilitiesCents,
              )}
              currency={currency}
              tone="stone"
            />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">By asset type</h2>
            {ASSET_TYPES.filter((type) =>
              summary.assetTypesPresent.includes(type),
            ).map((type) => (
              <Bar
                key={type}
                label={ASSET_TYPE_LABELS[type]}
                cents={netWorth.byAssetType[type]}
                scale={netWorth.totalAssetsCents}
                currency={currency}
                tone="teal"
              />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

async function TipsPanelLoader({ asOfDate }: { asOfDate: string }) {
  const narrated = await narrateDashboardTips(asOfDate, { skipAi: true });
  return (
    <TipsPanel
      tips={narrated.tips}
      source={narrated.source}
      refusalReason={narrated.refusalReason}
    />
  );
}

function TipsSkeleton() {
  return (
    <section className="mt-6 animate-pulse rounded-md border border-stone-200 px-4 py-3">
      <div className="h-4 w-16 rounded bg-stone-200" />
      <div className="mt-3 h-12 rounded bg-stone-100" />
    </section>
  );
}

function TipsPanel({
  tips,
  source,
  refusalReason,
}: {
  tips: DashboardTip[];
  source: "ai" | "cache" | "fallback";
  refusalReason?: string;
}) {
  const badge = source === "fallback" ? "Template" : "AI";
  return (
    <section className="mt-6 rounded-md border border-stone-200 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-stone-800">Tips</h2>
          <span className="inline-flex rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs font-medium text-stone-700">
            {badge}
          </span>
        </div>
        <form action={refreshTipsAction}>
          <button
            type="submit"
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
          >
            Refresh tips
          </button>
        </form>
      </div>
      {refusalReason ? (
        <p className="mt-2 text-sm text-stone-700">{refusalReason}</p>
      ) : null}
      {tips.length === 0 ? (
        <p className="mt-2 text-sm text-stone-700">
          No tips right now. A template appears when savings, the emergency
          fund, or a goal needs attention.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {tips.map((tip) => (
            <li
              key={tip.findingId}
              className={`rounded-md border px-3 py-3 ${
                tip.severity === "warn"
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-stone-200 bg-stone-50"
              }`}
            >
              <h3 className="text-sm font-medium text-stone-900">{tip.title}</h3>
              <p className="mt-1 text-sm text-stone-700">{tip.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GoalsSummary({
  goals,
  total,
  currency,
}: {
  goals: ReturnType<typeof loadGoals>["goals"];
  total: number;
  currency: string;
}) {
  return (
    <section className="mt-6 rounded-md border border-stone-200 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-stone-800">Goals</h2>
        <Link
          href="/goals"
          className="text-sm font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
        >
          {total > 3 ? "View all goals" : "Add goal"}
        </Link>
      </div>
      {total === 0 ? (
        <p className="mt-2 text-sm text-stone-700">
          No goals yet. A holiday in 6 months, a house deposit in 3 years, or
          retirement in 10 years are typical short, mid, and long goals.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {goals.map(({ goal, feasibility }) => (
            <li key={goal.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href={`/goals/${goal.id}`}
                className="font-medium text-teal-900 hover:underline"
              >
                {goal.name}
              </Link>
              <BucketBadge bucket={feasibility.bucket} />
              <StatusChip status={feasibility.status} />
              <span className="text-stone-700">
                {formatMoney(goal.setAsideCents, currency)} of{" "}
                {formatMoney(goal.targetAmountCents, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProgressRing({
  ratio,
  funded,
}: {
  ratio: number | null;
  funded: boolean;
}) {
  const arcRatio = ratio === null ? (funded ? 1 : 0) : Math.min(1, Math.max(0, ratio));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * arcRatio;
  const displayText = ratio === null ? (funded ? "Funded" : "No target") : (formatRatio(ratio) ?? "—");
  const label = ratio === null ? (funded ? "Funded" : "No target") : `${displayText} funded`;

  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <circle cx="24" cy="24" r={radius} fill="none" stroke="#e7e5e4" strokeWidth="4" />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        stroke="#0f766e"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform="rotate(-90 24 24)"
      />
      <text
        x="24"
        y="25"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#44403c"
        fontSize="10"
      >
        {ratio === null ? "—" : displayText}
      </text>
    </svg>
  );
}

function Bar({
  label,
  cents,
  scale,
  currency,
  tone,
}: {
  label: string;
  cents: number;
  scale: number;
  currency: string;
  tone: "teal" | "stone";
}) {
  const width = scale > 0 ? Math.min(100, (cents / scale) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between gap-4 text-sm">
        <span className="font-medium text-stone-800">{label}</span>
        <span className="text-stone-700">{formatMoney(cents, currency)}</span>
      </div>
      <div className="h-2 rounded bg-stone-200">
        <div
          className={`h-2 rounded ${tone === "teal" ? "bg-teal-700" : "bg-stone-500"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
