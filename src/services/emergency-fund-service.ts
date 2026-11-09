import {
  computeEmergencyFund,
  computeEssentialMonthlyAverage,
  trailingFullMonthRanges,
  type ContributingAsset,
  type EmergencyFundResult,
  type EssentialSpendSource,
  type SurplusConfidence,
  type SurplusSource,
} from "@/domain/emergency-fund";
import { deriveMonthSurplus } from "@/domain/derived-cashflow";
import type { DerivedAssetInput } from "@/domain/derived-cashflow";
import { sumCashflow, type CashflowLine, type DateRange } from "@/domain/cashflow";
import { listAssets } from "@/db/repositories/assets";
import { listCategories } from "@/db/repositories/categories";
import { listExpenses } from "@/db/repositories/expenses";
import { listIncomes } from "@/db/repositories/incomes";
import { getSettings } from "@/db/repositories/settings";
import {
  getLatestSnapshotsByAssetIds,
  listAllSnapshotsByAssetIds,
} from "@/db/repositories/snapshots";
import { todayUtc } from "@/lib/dates";

export type EmergencyFundAssetLine = ContributingAsset & {
  name: string;
};

export type EmergencyFundView = EmergencyFundResult & {
  currency: string;
  asOfDate: string;
  essentialSpendSource: EssentialSpendSource;
  computedEssentialMonthlyAverageCents: number;
  assets: EmergencyFundAssetLine[];
};

/**
 * Per-month surplus computation with journal/derived precedence.
 * Journal wins for a month when at least one income or expense entry exists in it.
 * Derived fills months with no journal coverage.
 * Exported so loadFinancialSnapshot can reuse it.
 */
export function resolveAvgMonthlySurplus(
  derivedInputs: readonly DerivedAssetInput[],
  incomes: readonly CashflowLine[],
  expenses: readonly CashflowLine[],
  asOfDate: string,
): { amountCents: number; source: SurplusSource; confidence: SurplusConfidence | null } {
  const ranges = trailingFullMonthRanges(asOfDate);
  let totalSurplus = 0;
  let derivedMonths = 0;
  let worstConfidence: SurplusConfidence = "high";

  for (const range of ranges) {
    if (monthHasJournalCoverage(incomes, expenses, range)) {
      const { surplusCents } = sumCashflow({ incomes, expenses }, range);
      totalSurplus += surplusCents;
    } else {
      const derived = deriveMonthSurplus(derivedInputs, range);
      totalSurplus += derived.surplusCents;
      derivedMonths++;
      if (derived.confidence === "insufficient_data") {
        worstConfidence = "insufficient_data";
      } else if (derived.confidence === "estimated" && worstConfidence !== "insufficient_data") {
        worstConfidence = "estimated";
      }
    }
  }

  const amountCents = roundHalfAwayFromZero(totalSurplus, 3);

  if (derivedMonths === 0) {
    return { amountCents, source: "journal", confidence: null };
  }
  if (derivedMonths === 3 && worstConfidence === "insufficient_data" && amountCents === 0) {
    return { amountCents: 0, source: "none", confidence: null };
  }
  return { amountCents, source: "derived", confidence: worstConfidence };
}

function monthHasJournalCoverage(
  incomes: readonly CashflowLine[],
  expenses: readonly CashflowLine[],
  range: DateRange,
): boolean {
  return (
    incomes.some((i) => i.occurredOn >= range.start && i.occurredOn <= range.end) ||
    expenses.some((e) => e.occurredOn >= range.start && e.occurredOn <= range.end)
  );
}

function roundHalfAwayFromZero(numerator: number, denominator: number): number {
  const negative = numerator < 0;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  const remainder = absolute % denominator;
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
}

export function getEmergencyFund(asOfDate = todayUtc()): EmergencyFundView {
  const row = getSettings();
  const targetMonths = row?.emergencyFundTargetMonths ?? 6;
  const currency = row?.displayCurrency ?? "EUR";

  const assetRows = listAssets();
  const incomeLines = listIncomes().map((income) => ({
    amountCents: income.amountCents,
    occurredOn: income.occurredOn,
  }));
  const expenseLines = listExpenses().map((expense) => ({
    amountCents: expense.amountCents,
    occurredOn: expense.occurredOn,
  }));

  const essential = computeEssentialMonthlyAverage(
    listExpenses().map((expense) => ({
      amountCents: expense.amountCents,
      occurredOn: expense.occurredOn,
      categoryId: expense.categoryId,
    })),
    listCategories("expense").map((category) => ({
      id: category.id,
      kind: "expense" as const,
      isEssential: category.isEssential,
    })),
    {
      emergencyFundTargetMonths: targetMonths,
      essentialMonthlySpendOverrideCents:
        row?.essentialMonthlySpendOverrideCents ?? null,
    },
    asOfDate,
  );

  const allSnapshotsByAsset = listAllSnapshotsByAssetIds(assetRows.map((a) => a.id));
  const latestByAsset = getLatestSnapshotsByAssetIds(assetRows.map((a) => a.id));

  const derivedInputs: DerivedAssetInput[] = assetRows.map((asset) => ({
    id: asset.id,
    isCash: asset.sleevePercents.cash === 100,
    snapshots: (allSnapshotsByAsset.get(asset.id) ?? []).map((s) => ({
      id: s.id,
      recordedOn: s.recordedOn,
      amountCents: s.amountCents,
    })),
  }));

  const surplusResolution = resolveAvgMonthlySurplus(
    derivedInputs,
    incomeLines,
    expenseLines,
    asOfDate,
  );

  const fund = computeEmergencyFund({
    essentialMonthlyAverageCents: essential.essentialMonthlyAverageCents,
    targetMonths,
    assets: assetRows.map((asset) => {
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
    asOfDate,
    avgMonthlySurplusOverride: surplusResolution,
  });

  const names = new Map(assetRows.map((asset) => [asset.id, asset.name]));
  const assets = fund.contributingAssets
    .map((asset) => ({
      ...asset,
      name: names.get(asset.id) ?? "Asset",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  return {
    ...fund,
    currency,
    asOfDate,
    essentialSpendSource: essential.source,
    computedEssentialMonthlyAverageCents: essential.computedAverageCents,
    assets,
  };
}
