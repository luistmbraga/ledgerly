import type { ReactNode } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatBps, formatRatio } from "@/lib/percent";
import { todayUtc } from "@/lib/dates";
import {
  WHAT_IF_HORIZON_YEARS,
  isEmptyAdjustments,
  runWhatIf,
  NO_ADJUSTMENTS,
  type WhatIfOutcome,
} from "@/domain/scenario";
import { StatusChip } from "../goals/goal-bits";
import { STATUS_LABELS } from "../goals/labels";
import { formatIsoToMonthYear, formatMonths } from "../projection/format";
import { loadWhatIfContext } from "./load";
import { parseWhatIfParams, type RawSearchParams } from "./parse-params";
import { ScenarioFigure } from "./scenario-figure";
import { WhatIfForm } from "./what-if-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function signedMoney(cents: number, currency: string): string {
  if (cents === 0) return "no change";
  return `${cents > 0 ? "+" : ""}${formatMoney(cents, currency)}`;
}

function signedMonths(months: number): string {
  if (months === 0) return "no change";
  return `${months > 0 ? "+" : "-"}${formatMonths(Math.abs(months))}`;
}

function signedPoints(ratioDelta: number): string {
  const points = Math.round(ratioDelta * 1000) / 10;
  if (points === 0) return "no change";
  return `${points > 0 ? "+" : "-"}${Math.abs(points)} pts`;
}

function closeText(close: WhatIfOutcome["emergencyFund"]["close"], gapCents: number): string {
  if (gapCents <= 0) return "Fully funded";
  if (close === null) return "Not on a closing path";
  return `${formatIsoToMonthYear(close.closeDate)} (${formatMonths(close.monthsToClose)})`;
}

function runwayText(runway: WhatIfOutcome["runway"]): string {
  if (runway === null) return "Not available";
  return formatMonths(runway.months);
}

/** One figure: the current value, and the hypothetical one when it differs. */
function Compare({
  label,
  now,
  whatIf,
}: {
  label: string;
  now: ReactNode;
  /** Already wrapped in ScenarioFigure, or null when there is nothing hypothetical to show. */
  whatIf: ReactNode | null;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-stone-100 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-sm text-stone-500 sm:w-48 sm:shrink-0">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-medium tabular-nums text-stone-900">{now}</span>
        {whatIf}
      </dd>
    </div>
  );
}

export default async function WhatIfPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const asOfDate = todayUtc();
  const context = loadWhatIfContext(asOfDate);
  const { currency, baseline } = context;

  const parsed = parseWhatIfParams(await searchParams, {
    percentAvailable: context.percentAvailable,
    liabilities: context.liabilities,
  });
  const hasErrors = parsed.adjustments === null;
  const adjustments = parsed.adjustments ?? NO_ADJUSTMENTS;
  const active = !hasErrors && !isEmptyAdjustments(adjustments);

  const { baseline: now, scenario, diff } = runWhatIf(baseline, adjustments);
  const money = (cents: number) => formatMoney(cents, currency);
  const hasSurplusData = context.surplusSource !== "none";
  const hasEssentialSpend = baseline.essentialMonthlyAverageCents > 0;
  const debt = adjustments.debt;
  const debtLiability = context.liabilities.find(
    (liability) => String(liability.id) === parsed.values.debt,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">What-if</h1>
        <p className="mt-1 text-sm text-stone-600">
          Change an input and see how your surplus, emergency fund, goals and
          projected net worth would differ. All figures are estimates — returns
          are not guaranteed.
        </p>
      </header>

      <p
        role="note"
        className="mt-4 rounded-md border border-dashed border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950"
      >
        <span className="font-semibold">Hypothetical.</span> Nothing here is
        saved or changes your data. Figures marked{" "}
        <ScenarioFigure>like this</ScenarioFigure> are what-if values, not your
        actual numbers.
      </p>

      <div className="mt-6 flex flex-col gap-8">
        <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <h2 className="text-sm font-semibold text-stone-700">Starting point</h2>
          <dl className="mt-2 flex flex-col gap-1 text-sm text-stone-700">
            <div className="flex gap-2">
              <dt className="text-stone-500">Monthly surplus</dt>
              <dd className="font-medium">
                {money(baseline.avgMonthlySurplusCents)}
                {context.surplusSource === "derived" && (
                  <span className="ml-1 text-xs font-normal text-stone-500">
                    (derived estimate
                    {context.surplusConfidence === "estimated" ? " — moderate confidence" : ""}
                    {context.surplusConfidence === "insufficient_data" ? " — low confidence" : ""})
                  </span>
                )}
                {context.surplusSource === "journal" && (
                  <span className="ml-1 text-xs font-normal text-stone-500">(from journal)</span>
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-stone-500">Current net worth</dt>
              <dd className="font-medium">{money(baseline.netWorthCents)}</dd>
            </div>
            {hasEssentialSpend && (
              <div className="flex gap-2">
                <dt className="text-stone-500">Essential monthly spend</dt>
                <dd className="font-medium">{money(baseline.essentialMonthlyAverageCents)}</dd>
              </div>
            )}
          </dl>
          {!hasSurplusData && (
            <p className="mt-3 text-xs text-amber-700">
              No surplus data available yet. Add a second month of balance
              snapshots via{" "}
              <Link href="/update" className="underline">
                Update balances
              </Link>{" "}
              for a more useful starting point.
            </p>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold">Change something</h2>
          <div className="mt-3">
            <WhatIfForm
              values={parsed.values}
              errors={parsed.errors}
              currency={currency}
              percentAvailable={context.percentAvailable}
              liabilities={context.liabilities}
            />
          </div>
          {hasErrors ? (
            <p className="mt-3 text-sm text-red-700">
              Fix the highlighted fields to see the what-if. Current figures are
              shown below.
            </p>
          ) : !active ? (
            <p className="mt-3 text-sm text-stone-600">
              No changes entered, so the figures below are your current ones.
            </p>
          ) : null}
        </section>

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Monthly picture</h2>
          <dl className="mt-2">
            <Compare
              label="Surplus left to allocate"
              now={money(now.avgMonthlySurplusCents)}
              whatIf={
                active ? (
                  <ScenarioFigure delta={signedMoney(diff.avgMonthlySurplusCents, currency)}>
                    {money(scenario.avgMonthlySurplusCents)}
                  </ScenarioFigure>
                ) : null
              }
            />
            {now.savingsRate !== null && (
              <Compare
                label="Savings rate"
                now={formatRatio(now.savingsRate)}
                whatIf={
                  active && scenario.savingsRate !== null && diff.savingsRate !== null ? (
                    <ScenarioFigure delta={signedPoints(diff.savingsRate)}>
                      {formatRatio(scenario.savingsRate)}
                    </ScenarioFigure>
                  ) : null
                }
              />
            )}
            <Compare
              label="Net worth today"
              now={money(now.netWorthCents)}
              whatIf={
                active && diff.netWorthCents !== 0 ? (
                  <ScenarioFigure delta={signedMoney(diff.netWorthCents, currency)}>
                    {money(scenario.netWorthCents)}
                  </ScenarioFigure>
                ) : null
              }
            />
          </dl>
          {active && debt ? (
            <p className="mt-2 text-xs text-stone-500">
              The what-if surplus is after the extra debt payment of{" "}
              {money(debt.extraMonthlyCents)} a month.
            </p>
          ) : null}
        </section>

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Emergency fund</h2>
          {baseline.emergencyFund.targetCents <= 0 ? (
            <p className="mt-2 text-sm text-stone-600">
              Set your essential monthly spend on the{" "}
              <Link href="/emergency-fund" className="text-teal-800 underline">
                Emergency fund
              </Link>{" "}
              page to include it here.
            </p>
          ) : (
            <dl className="mt-2">
              <Compare
                label="Gap"
                now={money(now.emergencyFund.gapCents)}
                whatIf={
                  active ? (
                    <ScenarioFigure delta={signedMoney(diff.emergencyFund.gapCents, currency)}>
                      {money(scenario.emergencyFund.gapCents)}
                    </ScenarioFigure>
                  ) : null
                }
              />
              <Compare
                label="Fully funded by"
                now={closeText(now.emergencyFund.close, now.emergencyFund.gapCents)}
                whatIf={
                  active ? (
                    <ScenarioFigure
                      delta={
                        diff.emergencyFund.monthsToClose === null
                          ? null
                          : signedMonths(diff.emergencyFund.monthsToClose)
                      }
                    >
                      {closeText(scenario.emergencyFund.close, scenario.emergencyFund.gapCents)}
                    </ScenarioFigure>
                  ) : null
                }
              />
            </dl>
          )}
          <p className="mt-2 text-xs text-stone-500">
            The fund target stays at today&apos;s essential spend. A spending
            change only moves the surplus.
          </p>
        </section>

        {now.goals.length > 0 && (
          <section className="border-t border-stone-200 pt-6">
            <h2 className="text-lg font-semibold">Goals</h2>
            <dl className="mt-2">
              {now.goals.map((goal, i) => {
                const after = scenario.goals[i];
                const change = diff.goals[i];
                return (
                  <Compare
                    key={goal.id}
                    label={goal.name}
                    now={
                      <span className="inline-flex flex-wrap items-baseline gap-2">
                        <StatusChip status={goal.status} />
                        <span className="font-normal text-stone-600">
                          needs {money(goal.requiredMonthlyCents)}/month
                        </span>
                      </span>
                    }
                    whatIf={
                      active ? (
                        <ScenarioFigure
                          delta={change.statusChanged ? "changed" : "no change"}
                        >
                          {STATUS_LABELS[after.status]}
                        </ScenarioFigure>
                      ) : null
                    }
                  />
                );
              })}
            </dl>
          </section>
        )}

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Net worth projection</h2>
          <p className="mt-1 text-sm text-stone-600">
            Same three return assumptions as the{" "}
            <Link href="/projection" className="text-teal-800 underline">
              Projection
            </Link>{" "}
            page.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="py-2 pr-4 text-left font-medium text-stone-600">Horizon</th>
                  {now.projections.map(({ key, label, returnBps }) => (
                    <th key={key} className="px-3 py-2 text-right font-medium text-stone-600">
                      {label}
                      <span className="block text-xs font-normal text-stone-400">
                        {returnBps === 0 ? "0% return" : `${formatBps(returnBps)}/yr`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WHAT_IF_HORIZON_YEARS.map((years, row) => (
                  <tr key={years} className={row % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                    <td className="py-2 pr-4 align-top font-medium text-stone-800">
                      {years === 1 ? "1 year" : `${years} years`}
                    </td>
                    {now.projections.map((projection, column) => {
                      const current = projection.milestones[row];
                      const hypothetical = scenario.projections[column].milestones[row];
                      const delta = diff.projections[column].milestones[row];
                      return (
                        <td key={projection.key} className="px-3 py-2 text-right align-top">
                          <div
                            className={`tabular-nums ${
                              current.netWorthCents < 0 ? "text-red-700" : "text-stone-900"
                            }`}
                          >
                            {money(current.netWorthCents)}
                          </div>
                          {active ? (
                            <div className="mt-1 flex justify-end">
                              <ScenarioFigure
                                delta={signedMoney(delta.netWorthCents, currency)}
                              >
                                {money(hypothetical.netWorthCents)}
                              </ScenarioFigure>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Returns are not guaranteed. Projections do not account for
            inflation, taxes, or changes in spending.
          </p>
        </section>

        {active && debt && scenario.debt ? (
          <section className="border-t border-stone-200 pt-6">
            <h2 className="text-lg font-semibold">Extra debt payment</h2>
            <p className="mt-1 text-sm text-stone-600">
              {debtLiability ? `${debtLiability.name}: ` : ""}
              {money(debt.extraMonthlyCents)} extra a month at{" "}
              {formatBps(debt.annualRateBps)} a year, against a balance of{" "}
              {money(debt.balanceCents)}.
            </p>
            <dl className="mt-2">
              {scenario.debt.map((milestone) => (
                <Compare
                  key={milestone.years}
                  label={`Interest avoided, ${milestone.years === 1 ? "1 year" : `${milestone.years} years`}`}
                  now={<span className="font-normal text-stone-500">—</span>}
                  whatIf={
                    <ScenarioFigure
                      delta={`${money(milestone.extraPaidCents)} paid extra`}
                    >
                      {money(milestone.interestAvoidedCents)}
                    </ScenarioFigure>
                  }
                />
              ))}
            </dl>
            <p className="mt-2 text-xs text-stone-500">
              An estimate from the rate you typed. Your actual payment schedule
              is not known here, so there is no payoff date, and the amount
              paid down is capped at today&apos;s balance.
            </p>
          </section>
        ) : null}

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Runway</h2>
          {!hasEssentialSpend ? (
            <p className="mt-2 text-sm text-stone-600">
              Set your essential monthly spend on the{" "}
              <Link href="/emergency-fund" className="text-teal-800 underline">
                Emergency fund
              </Link>{" "}
              page to see runway.
            </p>
          ) : (
            <dl className="mt-2">
              <Compare
                label="Net worth covers"
                now={runwayText(now.runway)}
                whatIf={
                  active && diff.runwayMonths !== null && diff.runwayMonths !== 0 ? (
                    <ScenarioFigure delta={signedMonths(diff.runwayMonths)}>
                      {runwayText(scenario.runway)}
                    </ScenarioFigure>
                  ) : null
                }
              />
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
