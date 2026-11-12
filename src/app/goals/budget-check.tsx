import Link from "next/link";
import type { BudgetTierId } from "@/domain/goal-budget";
import { centsToDecimalInput, formatMoney } from "@/lib/money";
import { formatIsoDate } from "./labels";
import type { BudgetCheckView } from "./load";

const TIER_LABELS: Record<BudgetTierId, { title: string; note: string }> = {
  comfortable: { title: "Comfortable", note: "Uses half of your spare cash and free monthly surplus." },
  balanced: { title: "Balanced", note: "Uses 80% of your spare cash and free monthly surplus." },
  stretch: { title: "Stretch", note: "Uses all of your spare cash and free monthly surplus." },
};

const inputClass =
  "rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400";

export function BudgetCheck({
  check,
  checkName,
  currency,
  todayIso,
}: {
  check: BudgetCheckView;
  checkName: string;
  currency: string;
  todayIso: string;
}) {
  const dateValue = check.state === "idle" ? "" : check.targetDate;
  const dateError = check.state === "invalid" ? check.error : undefined;

  return (
    <section id="budget" className="border-t border-stone-200 pt-6">
      <h2 className="text-lg font-semibold">Budget check</h2>
      <p className="mt-1 max-w-2xl text-sm text-stone-600">
        Not sure what to aim for? Pick a date and see how much you could spend
        by then without touching your emergency fund or the money your other
        goals need.
      </p>

      <form method="get" action="/goals#budget" className="mt-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="checkName" className="text-sm font-medium text-stone-800">
            What is it for?
          </label>
          <input
            id="checkName"
            name="checkName"
            type="text"
            maxLength={200}
            placeholder="Summer vacation"
            defaultValue={checkName}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="checkDate" className="text-sm font-medium text-stone-800">
            By when?
          </label>
          <input
            id="checkDate"
            name="checkDate"
            type="date"
            required
            min={todayIso}
            defaultValue={dateValue}
            aria-invalid={!!dateError}
            aria-describedby={dateError ? "checkDate-error" : undefined}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
        >
          Check budget
        </button>
      </form>
      {dateError ? (
        <p id="checkDate-error" role="alert" className="mt-2 text-sm text-red-700">
          {dateError}
        </p>
      ) : null}

      {check.state === "ready" ? (
        <BudgetResult check={check} checkName={checkName} currency={currency} />
      ) : null}
    </section>
  );
}

function BudgetResult({
  check,
  checkName,
  currency,
}: {
  check: Extract<BudgetCheckView, { state: "ready" }>;
  checkName: string;
  currency: string;
}) {
  const { result } = check;
  const months = result.monthsRemaining;
  const monthWord = months === 1 ? "month" : "months";
  const nothingFree = result.freeMonthlyCents === 0 && result.spareCashCents === 0;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="text-sm text-stone-800">
        {checkName.trim() ? `${checkName.trim()} by ` : "By "}
        {formatIsoDate(check.targetDate)}: {months} {monthWord} to save.
      </p>

      {check.noSurplusHistory && !nothingFree ? (
        <p className="text-sm text-stone-700">
          Not enough income and expense history to estimate monthly saving, so
          the ceiling uses spare cash only.
        </p>
      ) : null}

      {nothingFree && check.noSurplusHistory ? (
        <p className="max-w-2xl text-sm text-stone-700">
          There is not enough history yet to suggest a budget. Log income and
          expenses on{" "}
          <Link href="/activity" className="font-medium text-teal-800 underline underline-offset-2">
            Activity
          </Link>{" "}
          or record account balances on{" "}
          <Link href="/update" className="font-medium text-teal-800 underline underline-offset-2">
            Update
          </Link>
          , then check again.
        </p>
      ) : nothingFree ? (
        <p className="max-w-2xl text-sm text-stone-700">
          Your emergency fund and existing goals use all of your cash and
          monthly surplus right now, so there is no room for a new budget. The{" "}
          <Link href="/what-if" className="font-medium text-teal-800 underline underline-offset-2">
            What-if
          </Link>{" "}
          screen shows how changes in spending or goals would free some up.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3">
          {result.tiers.map((tier) => {
            const label = TIER_LABELS[tier.id];
            const prefill = new URLSearchParams({
              checkName,
              checkDate: check.targetDate,
              goalName: checkName.trim(),
              goalAmount: centsToDecimalInput(tier.ceilingCents),
              goalDate: check.targetDate,
              goalSetAside: centsToDecimalInput(tier.cashCents),
              goalMonthly: centsToDecimalInput(tier.monthlyCents),
            });
            return (
              <li key={tier.id} className="flex flex-col rounded-md border border-stone-200 p-4">
                <h3 className="text-sm font-medium text-stone-600">{label.title}</h3>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatMoney(tier.ceilingCents, currency)}
                </p>
                <p className="mt-2 text-sm text-stone-700">
                  Saving {formatMoney(tier.monthlyCents, currency)} a month for {months}{" "}
                  {monthWord}
                  {tier.cashCents > 0
                    ? `, plus ${formatMoney(tier.cashCents, currency)} of spare cash`
                    : ""}
                  .
                </p>
                <p className="mt-1 text-xs text-stone-500">{label.note}</p>
                {tier.ceilingCents > 0 ? (
                  <Link
                    href={`/goals?${prefill.toString()}#add`}
                    className="mt-auto pt-3 text-sm font-medium text-teal-800 underline decoration-teal-800/30 underline-offset-2 hover:text-teal-900"
                  >
                    Use as goal
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="max-w-2xl text-sm text-stone-600">
        <p>How this is worked out:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            Trailing 3-month average surplus:{" "}
            {formatMoney(check.avgMonthlySurplusCents, currency)} a month.
          </li>
          <li>
            Reserved for your other goals:{" "}
            {formatMoney(result.reservedMonthlyCents, currency)} a month, leaving{" "}
            {formatMoney(result.freeMonthlyCents, currency)} free.
          </li>
          <li>
            Spare cash: liquid cash above your emergency fund target of{" "}
            {formatMoney(check.emergencyTargetCents, currency)}
            {result.goalSetAsideCents > 0
              ? ` and the ${formatMoney(result.goalSetAsideCents, currency)} already set aside for goals`
              : ""}
            : {formatMoney(result.spareCashCents, currency)}.
          </li>
          <li>
            Each level uses the same share of spare cash and of the free monthly
            surplus. Spare cash a level does not use stays free.
          </li>
          <li>Flat saving with no investment return. Your recent pace may change.</li>
        </ul>
      </div>
    </div>
  );
}
