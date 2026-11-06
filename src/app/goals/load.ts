import { computeGoalFeasibility, type GoalFeasibility } from "@/domain/goals";
import { listGoals, type GoalRecord } from "@/db/repositories/goals";
import { getEmergencyFund } from "@/services/emergency-fund-service";

export type GoalView = {
  goal: GoalRecord;
  feasibility: GoalFeasibility;
};

export function loadGoals(asOfDate?: string) {
  const fund = getEmergencyFund(asOfDate);
  const goals: GoalView[] = listGoals().map((goal) => ({
    goal,
    feasibility: computeGoalFeasibility(
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
  }));

  return {
    currency: fund.currency,
    asOfDate: fund.asOfDate,
    avgMonthlySurplusCents: fund.avgMonthlySurplusCents,
    goals,
  };
}
