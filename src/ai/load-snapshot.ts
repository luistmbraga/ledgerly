import {
  computeEmergencyFund,
  computeEssentialMonthlyAverage,
} from "@/domain/emergency-fund";
import { resolveAvgMonthlySurplus } from "@/services/emergency-fund-service";
import { buildFinancialSnapshot } from "@/domain/financial-snapshot";
import type { FinancialSnapshot } from "@/domain/financial-snapshot";
import { computeNetWorth } from "@/domain/net-worth";
import {
  isPersonalityLabel,
  PERSONALITY_TITLES,
  type PersonalityLabel,
} from "@/domain/personality";
import { computeBudgetStatus } from "@/domain/budgets";
import { listAssets } from "@/db/repositories/assets";
import { listCategories } from "@/db/repositories/categories";
import { listExpenses, getMtdSpendByCategoryId } from "@/db/repositories/expenses";
import { listGoals } from "@/db/repositories/goals";
import { listIncomes } from "@/db/repositories/incomes";
import { listLiabilities } from "@/db/repositories/liabilities";
import { getInvestorProfile } from "@/db/repositories/personality";
import { getSettings } from "@/db/repositories/settings";
import {
  getLatestSnapshotsByAssetIds,
  getLatestSnapshotsByLiabilityIds,
  listAllSnapshotsByAssetIds,
} from "@/db/repositories/snapshots";
import { todayUtc } from "@/lib/dates";

export function loadFinancialSnapshot(asOfDate?: string): FinancialSnapshot {
  const asOf = asOfDate ?? todayUtc();
  const settings = getSettings();
  const currency = settings?.displayCurrency ?? "EUR";
  const targetMonths = settings?.emergencyFundTargetMonths ?? 6;

  const assets = listAssets();
  const liabilities = listLiabilities();
  const incomeRows = listIncomes();
  const expenseRows = listExpenses();
  const categoryRows = listCategories();
  const goalRows = listGoals();
  const profile = getInvestorProfile();

  const latestByAsset = getLatestSnapshotsByAssetIds(assets.map((a) => a.id));
  const latestByLiability = getLatestSnapshotsByLiabilityIds(liabilities.map((l) => l.id));
  const allSnapshotsByAsset = listAllSnapshotsByAssetIds(assets.map((a) => a.id));

  const netWorth = computeNetWorth(
    assets.map((a) => ({
      type: a.type,
      latestAmountCents: latestByAsset.get(a.id)?.amountCents ?? null,
    })),
    liabilities.map((l) => ({
      latestAmountCents: latestByLiability.get(l.id)?.amountCents ?? null,
    })),
  );

  const essential = computeEssentialMonthlyAverage(
    expenseRows.map((e) => ({
      amountCents: e.amountCents,
      occurredOn: e.occurredOn,
      categoryId: e.categoryId,
    })),
    categoryRows
      .filter((c) => c.kind === "expense")
      .map((c) => ({ id: c.id, kind: "expense" as const, isEssential: c.isEssential })),
    {
      emergencyFundTargetMonths: targetMonths,
      essentialMonthlySpendOverrideCents:
        settings?.essentialMonthlySpendOverrideCents ?? null,
    },
    asOf,
  );

  const incomeLines = incomeRows.map((i) => ({
    amountCents: i.amountCents,
    occurredOn: i.occurredOn,
  }));
  const expenseLines = expenseRows.map((e) => ({
    amountCents: e.amountCents,
    occurredOn: e.occurredOn,
  }));

  const surplusResolution = resolveAvgMonthlySurplus(
    assets.map((asset) => ({
      id: asset.id,
      isCash: asset.sleevePercents.cash === 100,
      snapshots: (allSnapshotsByAsset.get(asset.id) ?? []).map((s) => ({
        id: s.id,
        recordedOn: s.recordedOn,
        amountCents: s.amountCents,
      })),
    })),
    incomeLines,
    expenseLines,
    asOf,
  );

  const fund = computeEmergencyFund({
    essentialMonthlyAverageCents: essential.essentialMonthlyAverageCents,
    targetMonths,
    assets: assets.map((asset) => {
      const latest = latestByAsset.get(asset.id);
      return {
        id: asset.id,
        isLiquid: asset.isLiquid,
        snapshots: latest
          ? [{ id: latest.id, recordedOn: latest.recordedOn, amountCents: latest.amountCents }]
          : [],
      };
    }),
    incomes: incomeLines,
    expenses: expenseLines,
    asOfDate: asOf,
    avgMonthlySurplusOverride: surplusResolution,
  });

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

  const yearMonth = asOf.substring(0, 7);
  const mtdRows = getMtdSpendByCategoryId(yearMonth);
  const mtdByCategory = new Map<number, number>(mtdRows.map((r) => [r.categoryId, r.totalCents]));
  const budgetStatuses = categoryRows
    .filter((c) => c.kind === "expense" && c.budgetMonthlyCents != null && c.budgetMonthlyCents > 0)
    .map((c) =>
      computeBudgetStatus(
        c.id,
        c.name,
        c.budgetMonthlyCents!,
        mtdByCategory.get(c.id) ?? 0,
      ),
    );

  return buildFinancialSnapshot({
    asOf,
    currency,
    netWorth,
    budgetStatuses,
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
    incomes: incomeRows.map((i) => ({
      amountCents: i.amountCents,
      occurredOn: i.occurredOn,
    })),
    expenses: expenseRows.map((e) => ({
      amountCents: e.amountCents,
      occurredOn: e.occurredOn,
      categoryId: e.categoryId,
    })),
    categories: categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind === "income" ? "income" : "expense",
      isEssential: c.isEssential,
    })),
    goals: goalRows.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmountCents: g.targetAmountCents,
      targetDate: g.targetDate,
      setAsideCents: g.setAsideCents,
      plannedMonthlyCents: g.plannedMonthlyCents,
      expectedAnnualReturnBps: g.expectedAnnualReturnBps,
    })),
    investorProfile,
    allocationAssets: assets.map((asset) => ({
      type: asset.type,
      latestAmountCents: latestByAsset.get(asset.id)?.amountCents ?? null,
      includeInAllocation: asset.includeInAllocation,
      isLiquid: asset.isLiquid,
      sleevePercents: asset.sleevePercents,
    })),
    assetSnapshotDates: assets.map((asset) => ({
      name: asset.name,
      latestRecordedOn: latestByAsset.get(asset.id)?.recordedOn ?? null,
    })),
  });
}
