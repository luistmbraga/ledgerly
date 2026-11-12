import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { todayUtc } from "@/lib/dates";
import { Flash } from "@/components/flash";
import { createGoalAction } from "./actions";
import { BudgetCheck } from "./budget-check";
import { BucketBadge, ProgressBar, StatusChip } from "./goal-bits";
import { GoalForm, type GoalFormDefaults } from "./goal-form";
import { formatIsoDate } from "./labels";
import { loadGoalsWithBudgetCheck } from "./load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAVED: Record<string, string> = {
  deleted: "Goal deleted.",
};

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const param = (key: string) => {
    const value = raw[key];
    return typeof value === "string" ? value : undefined;
  };
  const today = todayUtc();
  const { board, check } = loadGoalsWithBudgetCheck(today, param("checkDate"));
  const savedKey = param("saved");
  const saved = savedKey ? SAVED[savedKey] : undefined;
  const prefill = prefillFromParams(param);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
        <p className="mt-1 text-sm text-stone-600">
          Targets with a date, amount already set aside, and whether the monthly
          pace can reach them.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-8">
        <Flash error={param("error")} message={saved} />

        {board.goals.length === 0 ? (
          <p className="text-sm text-stone-700">
            No goals yet. A holiday in 6 months, a house deposit in 3 years, or
            retirement in 10 years are typical short, mid, and long goals.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {board.goals.map(({ goal, feasibility }) => (
              <li key={goal.id} className="rounded-md border border-stone-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/goals/${goal.id}`}
                    className="font-medium text-teal-900 hover:underline"
                  >
                    {goal.name}
                  </Link>
                  <BucketBadge bucket={feasibility.bucket} />
                  <StatusChip status={feasibility.status} />
                </div>
                <p className="mt-2 text-sm text-stone-700">
                  Target date {formatIsoDate(goal.targetDate)}
                </p>
                <p className="mt-1 text-sm text-stone-700">
                  {formatMoney(goal.setAsideCents, board.currency)} set aside of{" "}
                  {formatMoney(goal.targetAmountCents, board.currency)}
                </p>
                <div className="mt-3 max-w-md">
                  <ProgressBar
                    setAsideCents={goal.setAsideCents}
                    targetAmountCents={goal.targetAmountCents}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <BudgetCheck
          check={check}
          checkName={param("checkName") ?? ""}
          currency={board.currency}
          todayIso={today}
        />

        <section id="add" className="max-w-xl border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">
            {board.goals.length === 0 ? "Add your first goal" : "Add goal"}
          </h2>
          <div className="mt-4">
            {prefill ? (
              <p className="mb-4 text-sm text-stone-700">
                Filled in from the budget check. Review and add the goal.
              </p>
            ) : null}
            <GoalForm
              key={prefill ? JSON.stringify(prefill) : "empty"}
              action={createGoalAction}
              submitLabel="Add goal"
              defaults={prefill}
            />
          </div>
        </section>
      </div>
    </div>
  );
}


function prefillFromParams(
  param: (key: string) => string | undefined,
): GoalFormDefaults | undefined {
  const targetAmount = param("goalAmount");
  if (targetAmount === undefined) return undefined;
  return {
    name: (param("goalName") ?? "").slice(0, 200),
    targetAmount,
    targetDate: param("goalDate") ?? "",
    setAside: param("goalSetAside") ?? "",
    plannedMonthly: param("goalMonthly") ?? "",
    expectedReturnPercent: "",
  };
}
