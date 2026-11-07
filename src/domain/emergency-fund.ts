import { parseIsoDate } from "../lib/dates";
import { sumCashflow, type CashflowLine, type DateRange } from "./cashflow";
import { selectLatestSnapshot, type DatedSnapshot } from "./net-worth";

export type EssentialExpense = {
  amountCents: number;
  occurredOn: string;
  categoryId: number | null;
};

export type EssentialCategory = {
  id: number;
  isEssential: boolean;
};

export type EmergencyFundSettings = {
  emergencyFundTargetMonths: number;
  essentialMonthlySpendOverrideCents: number | null;
};

export type EssentialSpendSource = "override" | "computed";

export type EssentialMonthlyAverage = {
  /** Override when set; otherwise the rounded 3-month essential average. */
  essentialMonthlyAverageCents: number;
  computedAverageCents: number;
  source: EssentialSpendSource;
};

export type EmergencyFundAsset = {
  id: number;
  isLiquid: boolean;
  snapshots: readonly DatedSnapshot[];
};

export type ContributingAsset = {
  id: number;
  amountCents: number;
};

export type EmergencyFundResult = {
  targetMonths: number;
  essentialMonthlyAverageCents: number;
  targetCents: number;
  eligibleCents: number;
  fundedRatio: number | null;
  gapCents: number;
  avgMonthlySurplusCents: number;
  monthsToCloseGap: number | null;
  contributingAssets: ContributingAsset[];
};

/** Integer division, half away from zero. */
function roundHalfAwayFromZero(numerator: number, denominator: number): number {
  const negative = numerator < 0;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  const remainder = absolute % denominator;
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
}


function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  const shiftedYear = Math.floor(index / 12);
  return { year: shiftedYear, month: index - shiftedYear * 12 + 1 };
}

function monthRange(year: number, month: number): DateRange {
  const monthText = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Last 3 full calendar months ending before the month of `asOfDate`, oldest first. */
export function trailingFullMonthRanges(
  asOfDate: string,
): [DateRange, DateRange, DateRange] {
  const { year, month } = parseIsoDate(asOfDate);
  return [3, 2, 1].map((monthsBack) => {
    const shifted = shiftMonth(year, month, -monthsBack);
    return monthRange(shifted.year, shifted.month);
  }) as [DateRange, DateRange, DateRange];
}

function sumEssentialInRange(
  expenses: readonly EssentialExpense[],
  essentialCategoryIds: ReadonlySet<number>,
  range: DateRange,
): number {
  let total = 0;
  for (const expense of expenses) {
    if (expense.categoryId === null) continue;
    if (!essentialCategoryIds.has(expense.categoryId)) continue;
    if (
      expense.occurredOn >= range.start &&
      expense.occurredOn <= range.end
    ) {
      total += expense.amountCents;
    }
  }
  return total;
}

export function computeEssentialMonthlyAverage(
  expenses: readonly EssentialExpense[],
  categories: readonly EssentialCategory[],
  settings: EmergencyFundSettings,
  asOfDate: string,
): EssentialMonthlyAverage {
  const essentialCategoryIds = new Set(
    categories.filter((category) => category.isEssential).map((category) => category.id),
  );
  const ranges = trailingFullMonthRanges(asOfDate);
  const essentialSum = ranges.reduce(
    (sum, range) => sum + sumEssentialInRange(expenses, essentialCategoryIds, range),
    0,
  );
  const computedAverageCents = roundHalfAwayFromZero(essentialSum, 3);
  const override = settings.essentialMonthlySpendOverrideCents;
  if (override !== null) {
    return {
      essentialMonthlyAverageCents: override,
      computedAverageCents,
      source: "override",
    };
  }
  return {
    essentialMonthlyAverageCents: computedAverageCents,
    computedAverageCents,
    source: "computed",
  };
}

export function computeEmergencyFund(input: {
  essentialMonthlyAverageCents: number;
  targetMonths: number;
  assets: readonly EmergencyFundAsset[];
  incomes: readonly CashflowLine[];
  expenses: readonly CashflowLine[];
  asOfDate: string;
}): EmergencyFundResult {
  const targetCents =
    input.essentialMonthlyAverageCents * input.targetMonths;

  const contributingAssets: ContributingAsset[] = [];
  let eligibleCents = 0;
  for (const asset of input.assets) {
    if (!asset.isLiquid) continue;
    const amountCents =
      selectLatestSnapshot(asset.snapshots)?.amountCents ?? 0;
    eligibleCents += amountCents;
    contributingAssets.push({ id: asset.id, amountCents });
  }

  const fundedRatio =
    targetCents > 0 ? eligibleCents / targetCents : null;
  const gapCents = Math.max(0, targetCents - eligibleCents);

  const surplusSum = trailingFullMonthRanges(input.asOfDate).reduce(
    (sum, range) =>
      sum + sumCashflow(
        { incomes: input.incomes, expenses: input.expenses },
        range,
      ).surplusCents,
    0,
  );
  const avgMonthlySurplusCents = roundHalfAwayFromZero(surplusSum, 3);
  const monthsToCloseGap =
    avgMonthlySurplusCents > 0 ? gapCents / avgMonthlySurplusCents : null;

  return {
    targetMonths: input.targetMonths,
    essentialMonthlyAverageCents: input.essentialMonthlyAverageCents,
    targetCents,
    eligibleCents,
    fundedRatio,
    gapCents,
    avgMonthlySurplusCents,
    monthsToCloseGap,
    contributingAssets,
  };
}
