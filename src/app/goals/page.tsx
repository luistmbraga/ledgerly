import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { todayUtc } from "@/lib/dates";
import { createGoalAction } from "./actions";
import { BucketBadge, ProgressBar, StatusChip } from "./goal-bits";
import { GoalForm } from "./goal-form";
import { formatIsoDate } from "./labels";
import { loadGoals } from "./load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAVED: Record<string, string> = {
  deleted: "Goal deleted.",
};

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const board = loadGoals(todayUtc());
  const saved = params.saved ? SAVED[params.saved] : undefined;

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
        <Flash error={params.error} message={saved} />

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

        <section id="add" className="max-w-xl border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">
            {board.goals.length === 0 ? "Add your first goal" : "Add goal"}
          </h2>
          <div className="mt-4">
            <GoalForm action={createGoalAction} submitLabel="Add goal" />
          </div>
        </section>
      </div>
    </div>
  );
}

function Flash({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {message ? (
        <p
          role="status"
          className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
