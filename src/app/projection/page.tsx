import { formatMoney } from "@/lib/money";
import { todayUtc } from "@/lib/dates";
import { getCashflowKpis, getDashboardSummary } from "@/services/dashboard-summary";
import { getEmergencyFund } from "@/services/emergency-fund-service";
import {
  SCENARIOS,
  computeRunway,
  projectEmergencyFundClose,
  projectNetWorth,
} from "@/domain/projection";
import { formatIsoToMonthYear, formatMonths } from "./format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HORIZON_YEARS = [1, 3, 5, 10] as const;

export default function ProjectionPage() {
  const asOfDate = todayUtc();
  const summary = getDashboardSummary();
  const kpis = getCashflowKpis(asOfDate);
  const fund = getEmergencyFund(asOfDate);

  const { netWorth, currency } = summary;
  const surplus = kpis.avgMonthlySurplusCents;
  const hasSurplusData = kpis.source !== "none";
  const hasEssentialSpend = fund.essentialMonthlyAverageCents > 0;

  const projections = SCENARIOS.map(({ key, label, returnBps }) => ({
    key,
    label,
    returnBps,
    milestones: projectNetWorth(
      netWorth.netWorthCents,
      surplus,
      returnBps,
      HORIZON_YEARS,
    ),
  }));

  const fundClose =
    fund.gapCents > 0
      ? projectEmergencyFundClose(fund.gapCents, surplus, asOfDate)
      : null;

  const runway = hasEssentialSpend
    ? computeRunway(netWorth.netWorthCents, fund.essentialMonthlyAverageCents)
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Projection</h1>
        <p className="mt-1 text-sm text-stone-600">
          Where your net worth is headed based on current pace. All figures are
          estimates — returns are not guaranteed.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-8">
        {/* Assumptions card */}
        <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <h2 className="text-sm font-semibold text-stone-700">Assumptions</h2>
          <dl className="mt-2 flex flex-col gap-1 text-sm text-stone-700">
            <div className="flex gap-2">
              <dt className="text-stone-500">Monthly surplus</dt>
              <dd className="font-medium">
                {formatMoney(surplus, currency)}
                {kpis.source === "derived" && (
                  <span className="ml-1 text-xs font-normal text-stone-500">
                    (derived estimate
                    {kpis.confidence === "estimated" ? " — moderate confidence" : ""}
                    {kpis.confidence === "insufficient_data" ? " — low confidence" : ""})
                  </span>
                )}
                {kpis.source === "journal" && (
                  <span className="ml-1 text-xs font-normal text-stone-500">(from journal)</span>
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-stone-500">Current net worth</dt>
              <dd className="font-medium">{formatMoney(netWorth.netWorthCents, currency)}</dd>
            </div>
            {hasEssentialSpend && (
              <div className="flex gap-2">
                <dt className="text-stone-500">Essential monthly spend</dt>
                <dd className="font-medium">
                  {formatMoney(fund.essentialMonthlyAverageCents, currency)}
                </dd>
              </div>
            )}
          </dl>
          {!hasSurplusData && (
            <p className="mt-3 text-xs text-amber-700">
              No surplus data available yet. Add a second month of balance snapshots
              via{" "}
              <a href="/update" className="underline">
                Update balances
              </a>{" "}
              to unlock projections.
            </p>
          )}
        </section>

        {/* Net worth projection table */}
        <section>
          <h2 className="text-lg font-semibold">Net worth projection</h2>
          <p className="mt-1 text-sm text-stone-600">
            Three return scenarios — conservative assumes savings only; balanced and
            growth add compound returns before inflation.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="py-2 pr-4 text-left font-medium text-stone-600">
                    Horizon
                  </th>
                  {SCENARIOS.map(({ key, label, returnBps }) => (
                    <th
                      key={key}
                      className="py-2 px-3 text-right font-medium text-stone-600"
                    >
                      {label}
                      <span className="block text-xs font-normal text-stone-400">
                        {returnBps === 0 ? "0% return" : `${returnBps / 100}%/yr`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HORIZON_YEARS.map((years, rowIdx) => (
                  <tr
                    key={years}
                    className={rowIdx % 2 === 0 ? "bg-white" : "bg-stone-50"}
                  >
                    <td className="py-2 pr-4 font-medium text-stone-800">
                      {years === 1 ? "1 year" : `${years} years`}
                    </td>
                    {projections.map(({ key, milestones }) => {
                      const m = milestones[rowIdx];
                      return (
                        <td
                          key={key}
                          className={`py-2 px-3 text-right tabular-nums ${
                            m.netWorthCents < 0 ? "text-red-700" : "text-stone-900"
                          }`}
                        >
                          {formatMoney(m.netWorthCents, currency)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Returns are not guaranteed. Projections do not account for inflation,
            taxes, or changes in spending.
          </p>
        </section>

        {/* Emergency fund close */}
        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Emergency fund</h2>
          {fund.gapCents <= 0 ? (
            <p className="mt-2 text-sm text-teal-800 font-medium">
              Your emergency fund is fully funded.
            </p>
          ) : fundClose ? (
            <div className="mt-2 flex flex-col gap-1 text-sm text-stone-700">
              <p>
                Gap:{" "}
                <span className="font-medium">{formatMoney(fund.gapCents, currency)}</span>
              </p>
              <p>
                At current pace, fully funded by{" "}
                <span className="font-semibold text-teal-900">
                  {formatIsoToMonthYear(fundClose.closeDate)}
                </span>{" "}
                <span className="text-stone-500">
                  ({formatMonths(fundClose.monthsToClose)})
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-stone-600">
              Gap: {formatMoney(fund.gapCents, currency)}.{" "}
              {surplus <= 0
                ? "Increase your monthly surplus to close the gap."
                : "Not enough data to project a close date."}
            </p>
          )}
        </section>

        {/* Runway */}
        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Runway</h2>
          {!hasEssentialSpend ? (
            <p className="mt-2 text-sm text-stone-600">
              Set your essential monthly spend on the{" "}
              <a href="/emergency-fund" className="text-teal-800 underline">
                Emergency fund
              </a>{" "}
              page to see how long your net worth would last without income.
            </p>
          ) : runway === null || runway.months === 0 ? (
            <p className="mt-2 text-sm text-stone-600">
              Current net worth does not cover any essential spending.
            </p>
          ) : (
            <div className="mt-2 text-sm text-stone-700">
              <p>
                At{" "}
                <span className="font-medium">
                  {formatMoney(fund.essentialMonthlyAverageCents, currency)}/month
                </span>{" "}
                of essential spending, your current net worth covers{" "}
                <span className="font-semibold text-teal-900">
                  {formatMonths(runway.months)}
                </span>{" "}
                without any income.
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Runway uses current net worth only — it does not model asset returns or
                changes in spending.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
