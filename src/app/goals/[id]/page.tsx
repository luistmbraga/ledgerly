import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDelete } from "@/app/assets/confirm-delete";
import { getGoal } from "@/db/repositories/goals";
import { centsToDecimalInput, formatMoney } from "@/lib/money";
import { todayUtc } from "@/lib/dates";
import { deleteGoalAction, updateGoalAction } from "../actions";
import { BucketBadge, StatusChip } from "../goal-bits";
import { GoalForm, percentDefault } from "../goal-form";
import { explainGoal } from "@/ai/tasks/goal-explain";
import { explainGoalAction } from "@/app/ai-actions";
import { formatIsoDate, goalTemplateExplanation } from "../labels";
import { loadGoals } from "../load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAVED: Record<string, string> = {
  created: "Goal saved.",
  updated: "Goal saved.",
};

export default async function GoalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id: rawId } = await params;
  const query = await searchParams;
  if (!/^\d+$/.test(rawId)) notFound();
  const goal = getGoal(Number(rawId));
  if (!goal) notFound();

  const board = loadGoals(todayUtc());
  const view = board.goals.find((item) => item.goal.id === goal.id);
  if (!view) notFound();
  const { feasibility } = view;
  const saved = query.saved ? SAVED[query.saved] : undefined;
  const explained = await explainGoal(
    {
      currency: board.currency,
      avgMonthlySurplusCents: board.avgMonthlySurplusCents,
      goal: {
        id: goal.id,
        name: goal.name,
        bucket: feasibility.bucket,
        targetAmountCents: goal.targetAmountCents,
        targetDate: goal.targetDate,
        setAsideCents: goal.setAsideCents,
        remainingCents: feasibility.remainingCents,
        requiredMonthlyCents: feasibility.requiredMonthlyCents,
        status: feasibility.status,
        plannedMonthlyCents: goal.plannedMonthlyCents,
        expectedAnnualReturnBps: goal.expectedAnnualReturnBps,
      },
    },
    { skipAi: true },
  );
  const explanationBadge = explained
    ? explained.source === "fallback"
      ? "Template"
      : "AI"
    : "Template";
  const plannedLabel =
    goal.plannedMonthlyCents === null
      ? "Not set"
      : formatMoney(goal.plannedMonthlyCents, board.currency);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <p className="text-sm">
          <Link
            href="/goals"
            className="font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
          >
            Goals
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{goal.name}</h1>
          <BucketBadge bucket={feasibility.bucket} />
          <StatusChip status={feasibility.status} />
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Target {formatMoney(goal.targetAmountCents, board.currency)} by{" "}
          {formatIsoDate(goal.targetDate)}.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-8">
        {saved ? (
          <p
            role="status"
            className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
          >
            {saved}
          </p>
        ) : null}
        {query.error ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {query.error}
          </p>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-stone-600">Required monthly</h2>
          <p className="text-4xl font-semibold tracking-tight">
            {formatMoney(feasibility.requiredMonthlyCents, board.currency)}
          </p>
          <p className="text-sm text-stone-700">
            {formatMoney(goal.setAsideCents, board.currency)} set aside.{" "}
            {formatMoney(feasibility.remainingCents, board.currency)} remaining
            over {feasibility.monthsRemaining}{" "}
            {feasibility.monthsRemaining === 1 ? "month" : "months"}.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Planned vs required</h2>
          <p className="text-sm text-stone-800">
            Planned monthly: {plannedLabel}
          </p>
          <p className="text-sm text-stone-800">
            Trailing 3-month average surplus:{" "}
            {formatMoney(board.avgMonthlySurplusCents, board.currency)}
          </p>
          <p className="text-sm text-stone-800">
            Required monthly:{" "}
            {formatMoney(feasibility.requiredMonthlyCents, board.currency)}
          </p>
          <p className="text-sm text-stone-700">
            {feasibility.comparisonSource === "planned"
              ? "Feasibility compares your planned monthly contribution with the required amount."
              : "Feasibility compares average surplus with the required amount because no planned monthly contribution is set."}
          </p>
        </section>

        <section className="max-w-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Explanation</h2>
            <form action={explainGoalAction}>
              <input type="hidden" name="goalId" value={goal.id} />
              <button
                type="submit"
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
              >
                Explain
              </button>
            </form>
          </div>
          {explained?.refusalReason ? (
            <p className="mt-2 text-sm text-stone-700">{explained.refusalReason}</p>
          ) : null}
          <p className="mt-2 text-sm text-stone-700">
            {explained
              ? explained.output.summary
              : goalTemplateExplanation({
                  status: feasibility.status,
                  remainingCents: feasibility.remainingCents,
                  hasPlannedMonthly: goal.plannedMonthlyCents !== null,
                  hasExpectedReturn: goal.expectedAnnualReturnBps !== null,
                })}
          </p>
          {explained && explained.output.steps.length > 0 ? (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-stone-700">
              {explained.output.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            {explanationBadge}
          </p>
        </section>

        <section className="max-w-xl border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Edit goal</h2>
          <div className="mt-4">
            <GoalForm
              action={updateGoalAction}
              submitLabel="Save goal"
              id={goal.id}
              defaults={{
                name: goal.name,
                targetAmount: centsToDecimalInput(goal.targetAmountCents),
                targetDate: goal.targetDate,
                setAside: centsToDecimalInput(goal.setAsideCents),
                plannedMonthly:
                  goal.plannedMonthlyCents === null
                    ? ""
                    : centsToDecimalInput(goal.plannedMonthlyCents),
                expectedReturnPercent: percentDefault(goal.expectedAnnualReturnBps),
              }}
            />
          </div>
        </section>

        <ConfirmDelete
          action={deleteGoalAction}
          id={goal.id}
          title="Delete goal"
          body="This removes the goal. It does not change asset balances."
          triggerLabel="Delete goal"
        />
      </div>
    </div>
  );
}
