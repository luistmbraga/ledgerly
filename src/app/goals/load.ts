import {
  allocateCapacity,
  computeGoalFeasibility,
  type GoalFeasibility,
} from "@/domain/goals";
import { listGoals, type GoalRecord } from "@/db/repositories/goals";
import { getEmergencyFund } from "@/services/emergency-fund-service";

export type GoalView = {
  goal: GoalRecord;
  feasibility: GoalFeasibility;
};

export function loadGoals(asOfDate?: string) {
  const fund = getEmergencyFund(asOfDate);
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
