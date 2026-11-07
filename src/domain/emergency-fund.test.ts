import { describe, expect, it } from "vitest";
import {
  computeEmergencyFund,
  computeEssentialMonthlyAverage,
  trailingFullMonthRanges,
  type EmergencyFundAsset,
  type EssentialCategory,
  type EssentialExpense,
} from "./emergency-fund";
import type { DatedSnapshot } from "./net-worth";

/**
 * Worked example from docs/domain.md (essential monthly spend + emergency fund).
 * asOf 2026-04-15 → full months Jan, Feb, Mar 2026.
 *
 * Essential expenses: 150_000 + 150_000 + 150_000 = 450_000; average 150_000.
 * Uncategorized and non-essential lines in that window are excluded.
 * Current-month and prior-window lines are excluded.
 * Target months 6 → target 900_000.
 * Liquid latest snapshots 400_000 + 50_000 = 450_000; brokerage ignored.
 * Gap 450_000. Funded ratio 0.5.
 * Monthly surplus 150_000 each full month (income 300_000 − expenses 150_000).
 * April cashflow is outside the window. Average surplus 150_000.
 * Months to close = 450_000 / 150_000 = 3.
 */
const AS_OF = "2026-04-15";

const categories: EssentialCategory[] = [
  { id: 1, kind: "expense", isEssential: true },
  { id: 2, kind: "expense", isEssential: false },
  { id: 3, kind: "expense", isEssential: true },
];

const essentialFixture: EssentialExpense[] = [
  { amountCents: 150_000, occurredOn: "2026-01-01", categoryId: 1 },
  { amountCents: 8_000, occurredOn: "2026-01-20", categoryId: 2 },
  { amountCents: 5_000, occurredOn: "2026-01-21", categoryId: null },
  { amountCents: 150_000, occurredOn: "2026-02-14", categoryId: 3 },
  { amountCents: 150_000, occurredOn: "2026-03-31", categoryId: 1 },
  { amountCents: 999_999, occurredOn: "2026-04-01", categoryId: 1 },
  { amountCents: 40_000, occurredOn: "2025-12-31", categoryId: 1 },
];

const incomes = [
  { amountCents: 300_000, occurredOn: "2026-01-15" },
  { amountCents: 300_000, occurredOn: "2026-02-15" },
  { amountCents: 300_000, occurredOn: "2026-03-15" },
  { amountCents: 900_000, occurredOn: "2026-04-02" },
];

const allExpenses = [
  { amountCents: 150_000, occurredOn: "2026-01-01" },
  { amountCents: 150_000, occurredOn: "2026-02-14" },
  { amountCents: 150_000, occurredOn: "2026-03-31" },
  { amountCents: 999_999, occurredOn: "2026-04-01" },
];

function snapshot(
  id: number,
  recordedOn: string,
  amountCents: number,
): DatedSnapshot {
  return { id, recordedOn, amountCents };
}

const assets: EmergencyFundAsset[] = [
  {
    id: 10,
    isLiquid: true,
    snapshots: [
      snapshot(1, "2026-01-01", 100_000),
      snapshot(2, "2026-03-01", 250_000),
      snapshot(4, "2026-04-01", 400_000),
      snapshot(3, "2026-04-01", 999_999),
    ],
  },
  {
    id: 11,
    isLiquid: true,
    snapshots: [snapshot(5, "2026-02-01", 50_000)],
  },
  {
    id: 12,
    isLiquid: false,
    snapshots: [snapshot(6, "2026-04-01", 2_000_000)],
  },
  {
    id: 13,
    isLiquid: true,
    snapshots: [],
  },
];

const settings = {
  emergencyFundTargetMonths: 6,
  essentialMonthlySpendOverrideCents: null,
};

describe("trailingFullMonthRanges", () => {
  it("uses the three full months before the as-of month", () => {
    expect(trailingFullMonthRanges(AS_OF)).toEqual([
      { start: "2026-01-01", end: "2026-01-31" },
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-03-01", end: "2026-03-31" },
    ]);
  });

  it("crosses the year boundary and includes a leap day", () => {
    expect(trailingFullMonthRanges("2024-03-15")).toEqual([
      { start: "2023-12-01", end: "2023-12-31" },
      { start: "2024-01-01", end: "2024-01-31" },
      { start: "2024-02-01", end: "2024-02-29" },
    ]);
    expect(trailingFullMonthRanges("2026-01-05")).toEqual([
      { start: "2025-10-01", end: "2025-10-31" },
      { start: "2025-11-01", end: "2025-11-30" },
      { start: "2025-12-01", end: "2025-12-31" },
    ]);
  });
});

describe("computeEssentialMonthlyAverage", () => {
  it("averages essential expenses over the three-month fixture", () => {
    const result = computeEssentialMonthlyAverage(
      essentialFixture,
      categories,
      settings,
      AS_OF,
    );
    expect(result).toEqual({
      essentialMonthlyAverageCents: 150_000,
      computedAverageCents: 150_000,
      source: "computed",
    });
  });

  it("rounds half away from zero", () => {
    const down = computeEssentialMonthlyAverage(
      [
        { amountCents: 100, occurredOn: "2026-01-02", categoryId: 1 },
        { amountCents: 100, occurredOn: "2026-02-02", categoryId: 1 },
        { amountCents: 101, occurredOn: "2026-03-02", categoryId: 1 },
      ],
      categories,
      settings,
      AS_OF,
    );
    expect(down.computedAverageCents).toBe(100);

    const up = computeEssentialMonthlyAverage(
      [
        { amountCents: 1, occurredOn: "2026-01-02", categoryId: 1 },
        { amountCents: 1, occurredOn: "2026-02-02", categoryId: 1 },
      ],
      categories,
      settings,
      AS_OF,
    );
    expect(up.computedAverageCents).toBe(1);

    const negative = computeEssentialMonthlyAverage(
      [
        { amountCents: -5, occurredOn: "2026-02-02", categoryId: 1 },
      ],
      categories,
      settings,
      AS_OF,
    );
    expect(negative.computedAverageCents).toBe(-2);
  });

  it("uses the settings override instead of the computed average", () => {
    const result = computeEssentialMonthlyAverage(
      essentialFixture,
      categories,
      { ...settings, essentialMonthlySpendOverrideCents: 200_000 },
      AS_OF,
    );
    expect(result).toEqual({
      essentialMonthlyAverageCents: 200_000,
      computedAverageCents: 150_000,
      source: "override",
    });
  });

  it("treats a zero override as set", () => {
    const result = computeEssentialMonthlyAverage(
      essentialFixture,
      categories,
      { ...settings, essentialMonthlySpendOverrideCents: 0 },
      AS_OF,
    );
    expect(result.source).toBe("override");
    expect(result.essentialMonthlyAverageCents).toBe(0);
    expect(result.computedAverageCents).toBe(150_000);
  });

  it("counts a leap-day essential expense in February", () => {
    const result = computeEssentialMonthlyAverage(
      [{ amountCents: 90, occurredOn: "2024-02-29", categoryId: 1 }],
      categories,
      settings,
      "2024-03-15",
    );
    expect(result.computedAverageCents).toBe(30);
  });

  it("ignores income categories even when marked essential", () => {
    const mixedCategories: EssentialCategory[] = [
      { id: 1, kind: "expense", isEssential: true },
      { id: 10, kind: "income", isEssential: true },
    ];
    const result = computeEssentialMonthlyAverage(
      [
        { amountCents: 150_000, occurredOn: "2026-01-01", categoryId: 1 },
        { amountCents: 999_000, occurredOn: "2026-02-01", categoryId: 10 },
        { amountCents: 150_000, occurredOn: "2026-03-01", categoryId: 1 },
      ],
      mixedCategories,
      settings,
      AS_OF,
    );
    expect(result.computedAverageCents).toBe(100_000);
  });
});

describe("computeEmergencyFund", () => {
  it("matches the domain fixture for target, eligible, gap, ratio, and months to close", () => {
    const result = computeEmergencyFund({
      essentialMonthlyAverageCents: 150_000,
      targetMonths: 6,
      assets,
      incomes,
      expenses: allExpenses,
      asOfDate: AS_OF,
    });

    expect(result.targetCents).toBe(900_000);
    expect(result.eligibleCents).toBe(450_000);
    expect(result.gapCents).toBe(450_000);
    expect(result.fundedRatio).toBe(0.5);
    expect(result.avgMonthlySurplusCents).toBe(150_000);
    expect(result.monthsToCloseGap).toBe(3);
    expect(result.contributingAssets).toEqual([
      { id: 10, amountCents: 400_000 },
      { id: 11, amountCents: 50_000 },
      { id: 13, amountCents: 0 },
    ]);
  });

  it("ignores a non-liquid asset even when it has a larger snapshot", () => {
    const result = computeEmergencyFund({
      essentialMonthlyAverageCents: 0,
      targetMonths: 6,
      assets: [assets[2]],
      incomes: [],
      expenses: [],
      asOfDate: AS_OF,
    });
    expect(result.eligibleCents).toBe(0);
    expect(result.contributingAssets).toEqual([]);
  });

  it("returns a null funded ratio when the target is zero and a zero gap when eligible covers it", () => {
    const covered = computeEmergencyFund({
      essentialMonthlyAverageCents: 100,
      targetMonths: 6,
      assets: [
        {
          id: 1,
          isLiquid: true,
          snapshots: [snapshot(1, "2026-04-01", 600)],
        },
      ],
      incomes,
      expenses: allExpenses,
      asOfDate: AS_OF,
    });
    expect(covered.targetCents).toBe(600);
    expect(covered.gapCents).toBe(0);
    expect(covered.fundedRatio).toBe(1);
    expect(covered.monthsToCloseGap).toBe(0);

    const noTarget = computeEmergencyFund({
      essentialMonthlyAverageCents: 0,
      targetMonths: 6,
      assets: [],
      incomes,
      expenses: allExpenses,
      asOfDate: AS_OF,
    });
    expect(noTarget.targetCents).toBe(0);
    expect(noTarget.fundedRatio).toBeNull();
    expect(noTarget.gapCents).toBe(0);
  });

  it("returns null months to close when average surplus is not positive", () => {
    const flat = computeEmergencyFund({
      essentialMonthlyAverageCents: 100_000,
      targetMonths: 3,
      assets: [],
      incomes: [],
      expenses: [],
      asOfDate: AS_OF,
    });
    expect(flat.avgMonthlySurplusCents).toBe(0);
    expect(flat.monthsToCloseGap).toBeNull();
    expect(flat.gapCents).toBe(300_000);

    const deficit = computeEmergencyFund({
      essentialMonthlyAverageCents: 100_000,
      targetMonths: 3,
      assets: [],
      incomes: [],
      expenses: [
        { amountCents: 100, occurredOn: "2026-01-04" },
        { amountCents: 100, occurredOn: "2026-02-04" },
        { amountCents: 100, occurredOn: "2026-03-04" },
      ],
      asOfDate: AS_OF,
    });
    expect(deficit.avgMonthlySurplusCents).toBe(-100);
    expect(deficit.monthsToCloseGap).toBeNull();
  });

  it("keeps months to close as a decimal", () => {
    const result = computeEmergencyFund({
      essentialMonthlyAverageCents: 100,
      targetMonths: 3,
      assets: [],
      incomes: [{ amountCents: 200, occurredOn: "2026-01-10" }],
      expenses: [],
      asOfDate: AS_OF,
    });
    expect(result.gapCents).toBe(300);
    expect(result.avgMonthlySurplusCents).toBe(67);
    expect(result.monthsToCloseGap).toBeCloseTo(300 / 67, 10);
  });

  it("rounds a negative surplus half away from zero", () => {
    const result = computeEmergencyFund({
      essentialMonthlyAverageCents: 0,
      targetMonths: 1,
      assets: [],
      incomes: [],
      expenses: [{ amountCents: 5, occurredOn: "2026-02-02" }],
      asOfDate: AS_OF,
    });
    expect(result.avgMonthlySurplusCents).toBe(-2);
    expect(result.monthsToCloseGap).toBeNull();
  });
});
