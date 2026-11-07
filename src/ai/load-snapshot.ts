import { buildFinancialSnapshot } from "@/domain/financial-snapshot";
import type { FinancialSnapshot } from "@/domain/financial-snapshot";
import { selectLatestSnapshot } from "@/domain/net-worth";
import {
  PERSONALITY_TITLES,
  type PersonalityLabel,
} from "@/domain/personality";
import { listAssets } from "@/db/repositories/assets";
import { listCategories } from "@/db/repositories/categories";
import { listExpenses } from "@/db/repositories/expenses";
import { listGoals } from "@/db/repositories/goals";
import { listIncomes } from "@/db/repositories/incomes";
import { getInvestorProfile } from "@/db/repositories/personality";
import { listSnapshotsForAsset } from "@/db/repositories/snapshots";
import { getDashboardSummary } from "@/services/dashboard-summary";
import { getEmergencyFund } from "@/services/emergency-fund-service";

function isPersonalityLabel(value: string): value is PersonalityLabel {
  return Object.prototype.hasOwnProperty.call(PERSONALITY_TITLES, value);
}

export function loadFinancialSnapshot(asOfDate?: string): FinancialSnapshot {
  const fund = getEmergencyFund(asOfDate);
  const summary = getDashboardSummary();
  const profile = getInvestorProfile();
  const assets = listAssets();
  const investorProfile =
    profile && isPersonalityLabel(profile.label)
      ? {
          label: profile.label,
          title: PERSONALITY_TITLES[profile.label],
          riskScore: profile.riskScore,
          horizonScore: profile.horizonScore,
          experienceScore: profile.experienceScore,
          liquidityScore: profile.liquidityScore,
        }
      : null;

  return buildFinancialSnapshot({
    asOf: fund.asOfDate,
    currency: fund.currency,
    netWorth: summary.netWorth,
    emergencyFund: {
      targetMonths: fund.targetMonths,
      targetCents: fund.targetCents,
      eligibleCents: fund.eligibleCents,
      fundedRatio: fund.fundedRatio,
      gapCents: fund.gapCents,
      avgMonthlySurplusCents: fund.avgMonthlySurplusCents,
      monthsToCloseGap: fund.monthsToCloseGap,
      essentialMonthlyAverageCents: fund.essentialMonthlyAverageCents,
    },
    incomes: listIncomes().map((income) => ({
      amountCents: income.amountCents,
      occurredOn: income.occurredOn,
    })),
    expenses: listExpenses().map((expense) => ({
      amountCents: expense.amountCents,
      occurredOn: expense.occurredOn,
      categoryId: expense.categoryId,
    })),
    categories: listCategories().map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind === "income" ? "income" : "expense",
      isEssential: category.isEssential,
    })),
    goals: listGoals().map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmountCents: goal.targetAmountCents,
      targetDate: goal.targetDate,
      setAsideCents: goal.setAsideCents,
      plannedMonthlyCents: goal.plannedMonthlyCents,
      expectedAnnualReturnBps: goal.expectedAnnualReturnBps,
    })),
    investorProfile,
    allocationAssets: assets.map((asset) => ({
      type: asset.type,
      latestAmountCents:
        selectLatestSnapshot(listSnapshotsForAsset(asset.id))?.amountCents ??
        null,
      includeInAllocation: asset.includeInAllocation,
      isLiquid: asset.isLiquid,
      sleevePercents: asset.sleevePercents,
    })),
  });
}
