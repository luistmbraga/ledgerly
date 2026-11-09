import { computeNetWorth } from "@/domain/net-worth";
import type { AssetType, NetWorthResult } from "@/domain/net-worth";
import {
  trailingFullMonthRanges,
  type SurplusSource,
  type SurplusConfidence,
} from "@/domain/emergency-fund";
import { deriveMonthSurplus } from "@/domain/derived-cashflow";
import type { DerivedAssetInput } from "@/domain/derived-cashflow";
import { sumCashflow, inRange } from "@/domain/cashflow";
import type { CashflowLine } from "@/domain/cashflow";
import { listAssets } from "@/db/repositories/assets";
import { listLiabilities } from "@/db/repositories/liabilities";
import { listExpenses } from "@/db/repositories/expenses";
import { listIncomes } from "@/db/repositories/incomes";
import { getSettings } from "@/db/repositories/settings";
import {
  getLatestSnapshotsByAssetIds,
  getLatestSnapshotsByLiabilityIds,
  listAllSnapshotsByAssetIds,
} from "@/db/repositories/snapshots";

export type DashboardSummary = {
  currency: string;
  assetCount: number;
  liabilityCount: number;
  netWorth: NetWorthResult;
  assetTypesPresent: AssetType[];
};

export function getDisplayCurrency(): string {
  return getSettings()?.displayCurrency ?? "EUR";
}

export type CashflowKpis = {
  avgMonthlyIncomeCents: number | null;
  avgMonthlyExpenseCents: number | null;
  avgMonthlySurplusCents: number;
  avgSavingsRate: number | null;
  source: SurplusSource;
  confidence: SurplusConfidence | null;
};

export function getDashboardSummary(): DashboardSummary {
  const assets = listAssets();
  const liabilities = listLiabilities();
  const latestByAsset = getLatestSnapshotsByAssetIds(assets.map((a) => a.id));
  const latestByLiability = getLatestSnapshotsByLiabilityIds(liabilities.map((l) => l.id));
  const assetsWithLatest = assets.map((asset) => ({
    type: asset.type,
    latestAmountCents: latestByAsset.get(asset.id)?.amountCents ?? null,
  }));
  const liabilitiesWithLatest = liabilities.map((liability) => ({
    latestAmountCents: latestByLiability.get(liability.id)?.amountCents ?? null,
  }));

  return {
    currency: getDisplayCurrency(),
    assetCount: assets.length,
    liabilityCount: liabilities.length,
    netWorth: computeNetWorth(assetsWithLatest, liabilitiesWithLatest),
    assetTypesPresent: [...new Set(assets.map((asset) => asset.type))],
  };
}

/**
 * Trailing 3-month average cashflow KPIs for the dashboard.
 * Journal wins per month when at least one entry exists in it; derived fills the rest.
 * income/expense are only populated when all 3 months come from the journal.
 */
export function getCashflowKpis(asOfDate: string): CashflowKpis {
  const assets = listAssets();
  const allSnapshots = listAllSnapshotsByAssetIds(assets.map((a) => a.id));
  const incomes: CashflowLine[] = listIncomes().map((i) => ({
    amountCents: i.amountCents,
    occurredOn: i.occurredOn,
  }));
  const expenses: CashflowLine[] = listExpenses().map((e) => ({
    amountCents: e.amountCents,
    occurredOn: e.occurredOn,
  }));

  const derivedInputs: DerivedAssetInput[] = assets.map((asset) => ({
    id: asset.id,
    isCash: asset.sleevePercents.cash === 100,
    snapshots: (allSnapshots.get(asset.id) ?? []).map((s) => ({
      id: s.id,
      recordedOn: s.recordedOn,
      amountCents: s.amountCents,
    })),
  }));

  const ranges = trailingFullMonthRanges(asOfDate);

  let totalIncome = 0;
  let totalExpense = 0;
  let totalSurplus = 0;
  let journalMonths = 0;
  let worstConfidence: SurplusConfidence = "high";
  let hasAnyDerived = false;

  for (const range of ranges) {
    const hasJournal =
      incomes.some((i) => inRange(i.occurredOn, range)) ||
      expenses.some((e) => inRange(e.occurredOn, range));

    if (hasJournal) {
      const cf = sumCashflow({ incomes, expenses }, range);
      totalIncome += cf.incomeCents;
      totalExpense += cf.expenseCents;
      totalSurplus += cf.surplusCents;
      journalMonths++;
    } else {
      const derived = deriveMonthSurplus(derivedInputs, range);
      totalSurplus += derived.surplusCents;
      hasAnyDerived = true;
      if (derived.confidence === "insufficient_data") {
        worstConfidence = "insufficient_data";
      } else if (
        derived.confidence === "estimated" &&
        worstConfidence !== "insufficient_data"
      ) {
        worstConfidence = "estimated";
      }
    }
  }

  const avgSurplus = kpiRound(totalSurplus, 3);

  if (!hasAnyDerived && journalMonths === 0) {
    return noData();
  }

  if (hasAnyDerived && worstConfidence === "insufficient_data" && avgSurplus === 0) {
    return noData();
  }

  if (!hasAnyDerived) {
    return {
      avgMonthlyIncomeCents: kpiRound(totalIncome, 3),
      avgMonthlyExpenseCents: kpiRound(totalExpense, 3),
      avgMonthlySurplusCents: avgSurplus,
      avgSavingsRate: totalIncome > 0 ? totalSurplus / totalIncome : null,
      source: "journal",
      confidence: null,
    };
  }

  return {
    avgMonthlyIncomeCents: null,
    avgMonthlyExpenseCents: null,
    avgMonthlySurplusCents: avgSurplus,
    avgSavingsRate: null,
    source: "derived",
    confidence: worstConfidence,
  };
}

function noData(): CashflowKpis {
  return {
    avgMonthlyIncomeCents: null,
    avgMonthlyExpenseCents: null,
    avgMonthlySurplusCents: 0,
    avgSavingsRate: null,
    source: "none",
    confidence: null,
  };
}

function kpiRound(numerator: number, denominator: number): number {
  const negative = numerator < 0;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  const remainder = absolute % denominator;
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
}
