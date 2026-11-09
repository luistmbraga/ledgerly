import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatRatio } from "@/lib/percent";
import { todayUtc } from "@/lib/dates";
import { getEmergencyFund } from "@/services/emergency-fund-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function EmergencyFundPage() {
  const fund = getEmergencyFund(todayUtc());
  const funded = fund.targetCents > 0 && fund.gapCents === 0;
  const missingEssentialTarget =
    fund.essentialSpendSource === "computed" &&
    fund.essentialMonthlyAverageCents === 0;
  const progress =
    fund.fundedRatio === null ? (funded ? 1 : 0) : Math.min(1, Math.max(0, fund.fundedRatio));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Emergency fund</h1>
        <p className="mt-1 text-sm text-stone-600">
          Target months times essential monthly spend. Eligible balance is the
          latest snapshot of each liquid asset.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-8">
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Target</h2>
          <p className="text-sm text-stone-800">
            <Link
              href="/settings"
              className="font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
            >
              {fund.targetMonths} {fund.targetMonths === 1 ? "month" : "months"}
            </Link>
            {" × "}
            {formatMoney(fund.essentialMonthlyAverageCents, fund.currency)}
            {" = "}
            <span className="font-semibold">
              {formatMoney(fund.targetCents, fund.currency)}
            </span>
          </p>
          <p className="text-sm text-stone-700">
            Essential spend:{" "}
            {fund.essentialSpendSource === "override"
              ? "Override from settings."
              : "Computed from essential expenses over the last 3 full months."}
          </p>
          {missingEssentialTarget ? (
            <p className="text-sm text-stone-800">
              There is no essential-spend target yet. Log essential expenses
              for the last three full months on{" "}
              <Link
                href="/activity"
                className="font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
              >
                Activity
              </Link>{" "}
              or set an essential monthly spend override in{" "}
              <Link
                href="/settings"
                className="font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
              >
                Settings
              </Link>
              .
            </p>
          ) : null}
          {fund.essentialSpendSource === "override" ? (
            <p className="text-sm text-stone-600">
              Computed average is{" "}
              {formatMoney(
                fund.computedEssentialMonthlyAverageCents,
                fund.currency,
              )}
              .
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Funding</h2>
          <p className="text-sm text-stone-800">
            Eligible liquid assets{" "}
            <span className="font-semibold">
              {formatMoney(fund.eligibleCents, fund.currency)}
            </span>
          </p>
          <div
            className="h-2 rounded bg-stone-200"
            role="meter"
            aria-label="Emergency fund progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="h-2 rounded bg-teal-700"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-sm text-stone-700">
            {missingEssentialTarget
              ? "No essential-spend target yet."
              : fund.fundedRatio === null
                ? "No target yet."
                : `${formatRatio(fund.fundedRatio) ?? "0%"} funded.`}
          </p>
          {funded ? (
            <p className="text-sm font-medium text-teal-900">
              Funded. Gap {formatMoney(0, fund.currency)}.
            </p>
          ) : fund.targetCents > 0 ? (
            <p className="text-sm text-stone-800">
              Gap {formatMoney(fund.gapCents, fund.currency)}.
              {fund.monthsToCloseGap === null
                ? " Increase surplus to close this gap."
                : ` About ${formatMonths(fund.monthsToCloseGap)} to close the gap at the recent average surplus of ${formatMoney(fund.avgMonthlySurplusCents, fund.currency)} per month.`}
            </p>
          ) : null}
          {fund.surplusSource === "derived" && (
            <p className="text-xs text-stone-500">
              Surplus estimated from balance snapshot changes
              {fund.surplusConfidence === "high"
                ? " (cash only — high confidence)."
                : fund.surplusConfidence === "estimated"
                  ? " (includes investment accounts — approximate)."
                  : "."}
              {" "}Does not show category breakdown.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Liquid assets</h2>
          {fund.assets.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-stone-700">
                No liquid assets. Mark a cash account as liquid, or add a cash
                asset, so its latest snapshot counts toward the fund.
              </p>
              <Link
                href="/assets"
                className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
              >
                Go to assets
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 text-stone-600">
                  <tr>
                    <th className="py-2 font-medium">Name</th>
                    <th className="py-2 text-right font-medium">Latest snapshot</th>
                  </tr>
                </thead>
                <tbody>
                  {fund.assets.map((asset) => (
                    <tr key={asset.id} className="border-b border-stone-100">
                      <td className="py-2">
                        <Link
                          href={`/assets/${asset.id}`}
                          className="font-medium text-teal-800 hover:text-teal-900"
                        >
                          {asset.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right text-stone-800">
                        {formatMoney(asset.amountCents, fund.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function formatMonths(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${rounded === 1 ? "month" : "months"}`;
}
