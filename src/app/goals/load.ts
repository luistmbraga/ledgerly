import {
  allocateCapacity,
  computeGoalFeasibility,
  type GoalFeasibility,
} from "@/domain/goals";
import { computeBudgetCeiling, type BudgetCeiling } from "@/domain/goal-budget";
import { listGoals, type GoalRecord } from "@/db/repositories/goals";
import { isValidIsoDate } from "@/lib/dates";
import {
  getEmergencyFund,
  type EmergencyFundView,
} from "@/services/emergency-fund-service";

export type GoalView = {
  goal: GoalRecord;
  feasibility: GoalFeasibility;
};

export function loadGoals(asOfDate?: string, fundView?: EmergencyFundView) {
  const fund = fundView ?? getEmergencyFund(asOfDate);
  const rawGoals = listGoals();

  const feasibilities = rawGoals.map((goal) =>
    computeGoalFeasibility(
      {
        targetAmountCents: goal.targetAmountCents,
        targetDate: goal.targetDate,
        setAsideCents: goal.setAsideCents,
        plannedMonthlyCents: goal.plannedMonthlyCents,
        expectedAnnualReturnBps: goal.expectedAnnualReturnBps,
      },
      fund.asOfDate,
      fund.avgMonthlySurplusCents,
    ),
  );

  const capacity = allocateCapacity(
    rawGoals.map((goal, i) => ({
      id: goal.id,
      fullMonthsUntilTarget: feasibilities[i].fullMonthsUntilTarget,
      requiredMonthlyCents: feasibilities[i].requiredMonthlyCents,
      remainingCents: feasibilities[i].remainingCents,
      plannedMonthlyCents: goal.plannedMonthlyCents,
    })),
    fund.avgMonthlySurplusCents,
  );
  const capacityMap = new Map(capacity.items.map((c) => [c.id, c]));

  const goals: GoalView[] = rawGoals.map((goal, i) => ({
    goal,
    feasibility: {
      ...feasibilities[i],
      status: capacityMap.get(goal.id)?.status ?? feasibilities[i].status,
    },
  }));

  return {
    currency: fund.currency,
    asOfDate: fund.asOfDate,
    avgMonthlySurplusCents: fund.avgMonthlySurplusCents,
    goals,
    portfolioVerdict: capacity.portfolioVerdict,
  };
}

export type BudgetCheckView =
  | { state: "idle" }
  | { state: "invalid"; error: string; targetDate: string }
  | {
      state: "ready";
      targetDate: string;
      result: BudgetCeiling;
      avgMonthlySurplusCents: number;
      emergencyTargetCents: number;
      noSurplusHistory: boolean;
    };

/** Goals board plus the optional budget check for `targetDate`. One emergency-fund read per request. */
export function loadGoalsWithBudgetCheck(asOfDate: string, targetDate: string | undefined) {
  const fund = getEmergencyFund(asOfDate);
  const board = loadGoals(asOfDate, fund);

  let check: BudgetCheckView = { state: "idle" };
  if (targetDate !== undefined && targetDate !== "") {
    if (!isValidIsoDate(targetDate)) {
      check = { state: "invalid", error: "Enter a valid date.", targetDate };
    } else if (targetDate < fund.asOfDate) {
      check = { state: "invalid", error: "Choose a date from today onward.", targetDate };
    } else {
      check = {
        state: "ready",
        targetDate,
        avgMonthlySurplusCents: fund.avgMonthlySurplusCents,
        emergencyTargetCents: fund.targetCents,
        noSurplusHistory: fund.surplusSource === "none",
        result: computeBudgetCeiling({
          asOfDate: fund.asOfDate,
          targetDate,
          avgMonthlySurplusCents: fund.surplusSource === "none" ? 0 : fund.avgMonthlySurplusCents,
          liquidCents: fund.eligibleCents,
          emergencyTargetCents: fund.targetCents,
          goals: board.goals.map(({ goal, feasibility }) => ({
            setAsideCents: goal.setAsideCents,
            remainingCents: feasibility.remainingCents,
            requiredMonthlyCents: feasibility.requiredMonthlyCents,
            plannedMonthlyCents: goal.plannedMonthlyCents,
            overdue: feasibility.status === "overdue",
          })),
        }),
      };
    }
  }

  return { board, check };
}
