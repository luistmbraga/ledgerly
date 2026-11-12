import type { SurplusConfidence, SurplusSource } from "@/domain/emergency-fund";
import type { WhatIfBaseline } from "@/domain/scenario";
import { listGoals } from "@/db/repositories/goals";
import { listLiabilities } from "@/db/repositories/liabilities";
import { getLatestSnapshotsByLiabilityIds } from "@/db/repositories/snapshots";
import { getCashflowKpis, getDashboardSummary } from "@/services/dashboard-summary";
import { getEmergencyFund } from "@/services/emergency-fund-service";

export type WhatIfLiability = {
  id: number;
  name: string;
  balanceCents: number;
};

export type WhatIfContext = {
  currency: string;
  baseline: WhatIfBaseline;
  surplusSource: SurplusSource;
  surplusConfidence: SurplusConfidence | null;
  /** True when the trailing income and expense averages are known. */
  percentAvailable: boolean;
  liabilities: WhatIfLiability[];
};

/** Read-only: gathers today's figures for the sandbox. Writes nothing. */
export function loadWhatIfContext(asOfDate: string): WhatIfContext {
  const summary = getDashboardSummary();
  const kpis = getCashflowKpis(asOfDate);
  const fund = getEmergencyFund(asOfDate);

  const liabilityRows = listLiabilities();
  const latestByLiability = getLatestSnapshotsByLiabilityIds(
    liabilityRows.map((liability) => liability.id),
  );

  return {
    currency: summary.currency,
    baseline: {
      asOf: asOfDate,
      netWorthCents: summary.netWorth.netWorthCents,
      avgMonthlySurplusCents: fund.avgMonthlySurplusCents,
      avgMonthlyIncomeCents: kpis.avgMonthlyIncomeCents,
      avgMonthlyExpenseCents: kpis.avgMonthlyExpenseCents,
      essentialMonthlyAverageCents: fund.essentialMonthlyAverageCents,
      emergencyFund: {
        targetCents: fund.targetCents,
        eligibleCents: fund.eligibleCents,
      },
      goals: listGoals().map((goal) => ({
        id: goal.id,
        name: goal.name,
        targetAmountCents: goal.targetAmountCents,
        targetDate: goal.targetDate,
        setAsideCents: goal.setAsideCents,
        plannedMonthlyCents: goal.plannedMonthlyCents,
        expectedAnnualReturnBps: goal.expectedAnnualReturnBps,
      })),
    },
    surplusSource: fund.surplusSource,
    surplusConfidence: fund.surplusConfidence,
    percentAvailable:
      kpis.avgMonthlyIncomeCents !== null && kpis.avgMonthlyExpenseCents !== null,
    liabilities: liabilityRows.map((liability) => ({
      id: liability.id,
      name: liability.name,
      balanceCents: latestByLiability.get(liability.id)?.amountCents ?? 0,
    })),
  };
}
