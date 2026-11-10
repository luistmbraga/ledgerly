import type { CashflowLine } from "./cashflow";
import { ratio, sumCashflow } from "./cashflow";
import { trailingFullMonthRanges } from "./emergency-fund";
import { buildFindings, type Finding } from "./findings";
import type { BudgetStatus } from "./budgets";
import {
  allocateCapacity,
  computeGoalFeasibility,
  sumShortGoalRemainingCents,
  type GoalStatus,
  type HorizonBucket,
} from "./goals";
import {
  bandForLabel,
  computeInvestableMix,
  ZERO_MIX,
  type AllocationAsset,
  type AllocationPercents,
} from "./allocation";
import type { AssetType, NetWorthResult } from "./net-worth";

/** Bump when formulas change so later AI cache keys can invalidate. */
export const DOMAIN_VERSION = "2026-11-09";

export type SnapshotCategory = {
  id: number;
  name: string;
  kind: "expense" | "income";
  isEssential: boolean;
};

export type SnapshotExpense = CashflowLine & {
  categoryId: number | null;
};

export type SnapshotGoalInput = {
  id: number;
  name: string;
  targetAmountCents: number;
  targetDate: string;
  setAsideCents: number;
  plannedMonthlyCents: number | null;
  expectedAnnualReturnBps: number | null;
};

export type SnapshotGoal = {
  id: number;
  name: string;
  bucket: HorizonBucket;
  targetAmountCents: number;
  targetDate: string;
  setAsideCents: number;
  remainingCents: number;
  requiredMonthlyCents: number;
  status: GoalStatus;
  plannedMonthlyCents: number | null;
};

export type FinancialSnapshot = {
  version: string;
  asOf: string;
  currency: string;
  netWorth: {
    totalAssetsCents: number;
    totalLiabilitiesCents: number;
    netWorthCents: number;
    byAssetType: Record<AssetType, number>;
  };
  cashflow: {
    trailingMonths: 3;
    incomeCents: number;
    expenseCents: number;
    surplusCents: number;
    savingsRate: number | null;
    essentialMonthlyAverageCents: number;
    discretionaryShareOfExpenses: number | null;
    uncategorizedExpenseShare: number | null;
  };
  emergencyFund: {
    targetMonths: number;
    targetCents: number;
    eligibleCents: number;
    fundedRatio: number | null;
    gapCents: number;
    avgMonthlySurplusCents: number | null;
    monthsToCloseGap: number | null;
  };
  goals: SnapshotGoal[];
  investorProfile: {
    label: string;
    title: string;
    riskScore: number;
    horizonScore: number;
    experienceScore: number;
    liquidityScore: number;
  } | null;
  allocation: {
    targetBand: AllocationPercents;
    /** Long-term mix after held emergency fund and short-goal cash are removed. */
    currentMix: AllocationPercents;
    shortGoalRemainingCents: number;
    emergencyReservedCents: number;
    shortGoalReservedCents: number;
  };
  findings: Finding[];
  categories: SnapshotCategory[];
};

export type FinancialSnapshotInput = {
  asOf: string;
  currency: string;
  netWorth: NetWorthResult;
  emergencyFund: FinancialSnapshot["emergencyFund"] & {
    essentialMonthlyAverageCents: number;
  };
  incomes: readonly CashflowLine[];
  expenses: readonly SnapshotExpense[];
  categories: readonly SnapshotCategory[];
  goals: readonly SnapshotGoalInput[];
  investorProfile: FinancialSnapshot["investorProfile"];
  /** Latest snapshot per asset. Omitted assets contribute nothing to the mix. */
  allocationAssets?: readonly AllocationAsset[];
  /** Asset names with their latest snapshot date, for staleness detection. */
  assetSnapshotDates?: ReadonlyArray<{ name: string; latestRecordedOn: string | null }>;
  /** MTD budget statuses for expense categories that have a budget set. */
  budgetStatuses?: ReadonlyArray<BudgetStatus>;
};

/** Inclusive span of the last three full calendar months before `asOf`. */
export function trailingThreeMonthRange(asOfDate: string): {
  start: string;
  end: string;
} {
  const [oldest, , newest] = trailingFullMonthRanges(asOfDate);
  return { start: oldest.start, end: newest.end };
}

function summarizeTrailingCashflow(
  incomes: readonly CashflowLine[],
  expenses: readonly SnapshotExpense[],
  categories: readonly SnapshotCategory[],
  asOf: string,
  essentialMonthlyAverageCents: number,
): FinancialSnapshot["cashflow"] & {
  discretionaryCents: number;
  expenseCount: number;
  uncategorizedExpenseCount: number;
  uncategorizedExpenseAmountCents: number;
} {
  const range = trailingThreeMonthRange(asOf);
  const totals = sumCashflow({ incomes, expenses }, range);
  const essentialIds = new Set(
    categories
      .filter((category) => category.kind === "expense" && category.isEssential)
      .map((category) => category.id),
  );

  let discretionaryCents = 0;
  let expenseCount = 0;
  let uncategorizedExpenseCount = 0;
  let uncategorizedExpenseAmountCents = 0;

  for (const expense of expenses) {
    if (expense.occurredOn < range.start || expense.occurredOn > range.end) {
      continue;
    }
    expenseCount += 1;
    const essential =
      expense.categoryId !== null && essentialIds.has(expense.categoryId);
    if (!essential) discretionaryCents += expense.amountCents;
    if (expense.categoryId === null) {
      uncategorizedExpenseCount += 1;
      uncategorizedExpenseAmountCents += expense.amountCents;
    }
  }

  return {
    trailingMonths: 3,
    incomeCents: totals.incomeCents,
    expenseCents: totals.expenseCents,
    surplusCents: totals.surplusCents,
    savingsRate: totals.savingsRate,
    essentialMonthlyAverageCents,
    discretionaryShareOfExpenses: ratio(discretionaryCents, totals.expenseCents),
    uncategorizedExpenseShare: ratio(
      uncategorizedExpenseAmountCents,
      totals.expenseCents,
    ),
    discretionaryCents,
    expenseCount,
    uncategorizedExpenseCount,
    uncategorizedExpenseAmountCents,
  };
}

export function buildFinancialSnapshot(
  input: FinancialSnapshotInput,
): FinancialSnapshot {
  const cashflow = summarizeTrailingCashflow(
    input.incomes,
    input.expenses,
    input.categories,
    input.asOf,
    input.emergencyFund.essentialMonthlyAverageCents,
  );
  const avgMonthlySurplusCents = input.emergencyFund.avgMonthlySurplusCents ?? 0;
  const rawGoals = input.goals.map((goal) => {
    const feasibility = computeGoalFeasibility(
      {
        targetAmountCents: goal.targetAmountCents,
        targetDate: goal.targetDate,
        setAsideCents: goal.setAsideCents,
        plannedMonthlyCents: goal.plannedMonthlyCents,
        expectedAnnualReturnBps: goal.expectedAnnualReturnBps,
      },
      input.asOf,
      avgMonthlySurplusCents,
    );
    return {
      id: goal.id,
      name: goal.name,
      bucket: feasibility.bucket,
      targetAmountCents: goal.targetAmountCents,
      targetDate: goal.targetDate,
      setAsideCents: goal.setAsideCents,
      remainingCents: feasibility.remainingCents,
      requiredMonthlyCents: feasibility.requiredMonthlyCents,
      plannedMonthlyCents: goal.plannedMonthlyCents,
      fullMonthsUntilTarget: feasibility.fullMonthsUntilTarget,
    };
  });

  const capacity = allocateCapacity(rawGoals, avgMonthlySurplusCents);
  const capacityMap = new Map(capacity.items.map((c) => [c.id, c]));

  const goals = rawGoals.map((g) => ({
    id: g.id,
    name: g.name,
    bucket: g.bucket,
    targetAmountCents: g.targetAmountCents,
    targetDate: g.targetDate,
    setAsideCents: g.setAsideCents,
    remainingCents: g.remainingCents,
    requiredMonthlyCents: g.requiredMonthlyCents,
    status: (capacityMap.get(g.id)?.status ?? "shortfall") as GoalStatus,
    plannedMonthlyCents: g.plannedMonthlyCents,
  }));

  const shortGoalRemainingCents = sumShortGoalRemainingCents(goals);
  const investable = computeInvestableMix(input.allocationAssets ?? [], {
    emergencyEligibleCents: input.emergencyFund.eligibleCents,
    emergencyTargetCents: input.emergencyFund.targetCents,
    shortGoalRemainingCents,
  });
  const targetBandOrNull =
    input.investorProfile === null
      ? null
      : (bandForLabel(input.investorProfile.label) ?? null);

  const findings = buildFindings({
    currency: input.currency,
    incomeCents: cashflow.incomeCents,
    surplusCents: cashflow.surplusCents,
    savingsRate: cashflow.savingsRate,
    expenseCents: cashflow.expenseCents,
    discretionaryCents: cashflow.discretionaryCents,
    expenseCount: cashflow.expenseCount,
    uncategorizedExpenseCount: cashflow.uncategorizedExpenseCount,
    uncategorizedExpenseAmountCents: cashflow.uncategorizedExpenseAmountCents,
    gapCents: input.emergencyFund.gapCents,
    fundedRatio: input.emergencyFund.fundedRatio,
    goals,
    totalAssetsCents: input.netWorth.totalAssetsCents,
    totalLiabilitiesCents: input.netWorth.totalLiabilitiesCents,
    cashAssetsCents: input.netWorth.byAssetType.cash,
    currentMix: investable.mix,
    targetBand: targetBandOrNull,
    assetSnapshots: input.assetSnapshotDates,
    asOf: input.asOf,
    budgetStatuses: input.budgetStatuses,
  });

  return {
    version: DOMAIN_VERSION,
    asOf: input.asOf,
    currency: input.currency,
    netWorth: input.netWorth,
    cashflow: {
      trailingMonths: 3,
      incomeCents: cashflow.incomeCents,
      expenseCents: cashflow.expenseCents,
      surplusCents: cashflow.surplusCents,
      savingsRate: cashflow.savingsRate,
      essentialMonthlyAverageCents: cashflow.essentialMonthlyAverageCents,
      discretionaryShareOfExpenses: cashflow.discretionaryShareOfExpenses,
      uncategorizedExpenseShare: cashflow.uncategorizedExpenseShare,
    },
    emergencyFund: {
      targetMonths: input.emergencyFund.targetMonths,
      targetCents: input.emergencyFund.targetCents,
      eligibleCents: input.emergencyFund.eligibleCents,
      fundedRatio: input.emergencyFund.fundedRatio,
      gapCents: input.emergencyFund.gapCents,
      avgMonthlySurplusCents: input.emergencyFund.avgMonthlySurplusCents,
      monthsToCloseGap: input.emergencyFund.monthsToCloseGap,
    },
    goals,
    investorProfile: input.investorProfile,
    allocation: {
      targetBand: { ...(targetBandOrNull ?? ZERO_MIX) },
      currentMix: investable.mix,
      shortGoalRemainingCents,
      emergencyReservedCents: investable.emergencyReservedCents,
      shortGoalReservedCents: investable.shortGoalReservedCents,
    },
    findings,
    categories: [...input.categories],
  };
}
