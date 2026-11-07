import { describe, expect, it } from "vitest";
import { ASSET_TYPES, type AssetType } from "./net-worth";
import { formatMoney } from "../lib/money";
import {
  buildFinancialSnapshot,
  type FinancialSnapshotInput,
} from "./financial-snapshot";
import {
  buildFindings,
  renderTipTemplates,
  type FindingsInput,
} from "./findings";

function inputs(overrides: Partial<FindingsInput> = {}): FindingsInput {
  return {
    currency: "EUR",
    incomeCents: 0,
    surplusCents: 0,
    expenseCents: 0,
    discretionaryCents: 0,
    expenseCount: 0,
    uncategorizedExpenseCount: 0,
    uncategorizedExpenseAmountCents: 0,
    gapCents: 0,
    fundedRatio: null,
    goals: [],
    ...overrides,
  };
}

function ids(overrides: Partial<FindingsInput> = {}): string[] {
  return buildFindings(inputs(overrides)).map((finding) => finding.id);
}

function zeroByAssetType(): Record<AssetType, number> {
  return Object.fromEntries(ASSET_TYPES.map((type) => [type, 0])) as Record<
    AssetType,
    number
  >;
}

function snapshotInput(
  overrides: Partial<FinancialSnapshotInput> = {},
): FinancialSnapshotInput {
  return {
    asOf: "2026-11-04",
    currency: "EUR",
    netWorth: {
      totalAssetsCents: 250_000,
      totalLiabilitiesCents: 40_000,
      netWorthCents: 210_000,
      byAssetType: { ...zeroByAssetType(), cash: 250_000 },
    },
    emergencyFund: {
      targetMonths: 6,
      essentialMonthlyAverageCents: 100_000,
      targetCents: 600_000,
      eligibleCents: 100_000,
      fundedRatio: 100_000 / 600_000,
      gapCents: 500_000,
      avgMonthlySurplusCents: 5_000,
      monthsToCloseGap: 100,
    },
    incomes: [],
    expenses: [],
    categories: [],
    goals: [],
    investorProfile: null,
    ...overrides,
  };
}

describe("buildFindings", () => {
  it("fires low_savings_rate when trailing surplus over income is under 10%", () => {
    const findings = buildFindings(
      inputs({
        incomeCents: 100_000,
        surplusCents: 9_000,
      }),
    );
    expect(findings.map((finding) => finding.id)).toEqual(["low_savings_rate"]);
    expect(findings[0]?.severity).toBe("warn");
    expect(findings[0]?.data.savingsRate).toBe(0.09);
  });

  it("does not fire low_savings_rate at exactly 10% or when income is zero", () => {
    expect(
      ids({ incomeCents: 100_000, surplusCents: 10_000 }),
    ).not.toContain("low_savings_rate");
    expect(
      ids({ incomeCents: 0, surplusCents: -5_000 }),
    ).not.toContain("low_savings_rate");
  });

  it("fires emergency_fund_gap when the gap is above zero and not when it is closed", () => {
    expect(ids({ gapCents: 1, fundedRatio: 0.5 })).toContain(
      "emergency_fund_gap",
    );
    expect(ids({ gapCents: 0, fundedRatio: 1 })).not.toContain(
      "emergency_fund_gap",
    );
    expect(ids({ gapCents: 0, fundedRatio: 1 })).toEqual([
      "emergency_fund_met",
    ]);
    expect(ids({ gapCents: 0, fundedRatio: null })).toEqual([]);
  });

  it("fires goal_shortfall when any goal status is shortfall", () => {
    const findings = buildFindings(
      inputs({
        goals: [
          { name: "Holiday", status: "on_track" },
          { name: "House deposit", status: "shortfall" },
        ],
      }),
    );
    expect(findings.map((finding) => finding.id)).toEqual(["goal_shortfall"]);
    expect(findings[0]?.data).toEqual({
      goalCount: 1,
      goalNames: "House deposit",
    });
  });

  it("fires goal_tight and goal_shortfall together when both statuses are present", () => {
    expect(
      ids({
        goals: [
          { name: "Buffer", status: "tight" },
          { name: "House deposit", status: "shortfall" },
        ],
      }),
    ).toEqual(["goal_shortfall", "goal_tight"]);
  });

  it("fires high_discretionary only above 40% of expenses", () => {
    expect(
      ids({ expenseCents: 100, discretionaryCents: 40 }),
    ).not.toContain("high_discretionary");
    expect(
      ids({ expenseCents: 100, discretionaryCents: 41 }),
    ).toContain("high_discretionary");
  });

  it("fires uncategorized_expenses when count or amount is above 15%", () => {
    expect(
      ids({
        expenseCount: 20,
        uncategorizedExpenseCount: 3,
        expenseCents: 100,
        uncategorizedExpenseAmountCents: 15,
      }),
    ).not.toContain("uncategorized_expenses");

    expect(
      ids({
        expenseCount: 6,
        uncategorizedExpenseCount: 1,
        expenseCents: 1_000,
        uncategorizedExpenseAmountCents: 10,
      }),
    ).toContain("uncategorized_expenses");

    expect(
      ids({
        expenseCount: 100,
        uncategorizedExpenseCount: 1,
        expenseCents: 100,
        uncategorizedExpenseAmountCents: 16,
      }),
    ).toContain("uncategorized_expenses");
  });

  it("fires negative_surplus and low_savings_rate when spending exceeds income", () => {
    const findings = buildFindings(
      inputs({
        currency: "USD",
        incomeCents: 100_00,
        surplusCents: -50_00,
        expenseCents: 150_00,
      }),
    );
    expect(findings.map((finding) => finding.id)).toEqual([
      "low_savings_rate",
      "negative_surplus",
    ]);
    expect(findings[1]?.data.deficitCents).toBe(50_00);
  });
});

describe("renderTipTemplates", () => {
  it("renders the low savings template from the finding data", () => {
    const tips = renderTipTemplates(
      buildFindings(inputs({ incomeCents: 100_000, surplusCents: 9_000 })),
    );
    expect(tips).toEqual([
      {
        findingId: "low_savings_rate",
        title: "Low savings rate",
        body: "Your savings rate is 9% over the last 3 months. Consider reducing discretionary spend.",
      },
    ]);
  });

  it("formats the emergency fund gap with the snapshot currency", () => {
    const findings = buildFindings(
      inputs({ gapCents: 15_000, fundedRatio: 0.5, currency: "EUR" }),
    );
    const tips = renderTipTemplates(findings);
    expect(tips[0]?.title).toBe("Emergency fund gap");
    expect(tips[0]?.body).toBe(
      `Your emergency fund is short ${formatMoney(15_000, "EUR")} (50% funded).`,
    );
  });

  it("keeps one tip per finding id and skips unknown ids", () => {
    const tips = renderTipTemplates([
      {
        id: "goal_shortfall",
        severity: "warn",
        data: { goalCount: 1, goalNames: "House deposit" },
      },
      {
        id: "goal_shortfall",
        severity: "warn",
        data: { goalCount: 2, goalNames: "Ignored" },
      },
      { id: "not_a_finding", severity: "info", data: {} },
    ]);
    expect(tips).toEqual([
      {
        findingId: "goal_shortfall",
        title: "Goal shortfall",
        body: "1 goal is short of the monthly amount needed: House deposit.",
      },
    ]);
  });
});

describe("buildFinancialSnapshot", () => {
  it("attaches low savings, emergency gap, and goal shortfall from a trailing-3-month fixture", () => {
    const snapshot = buildFinancialSnapshot(
      snapshotInput({
        incomes: [
          { amountCents: 100_000, occurredOn: "2026-08-15" },
          { amountCents: 100_000, occurredOn: "2026-09-15" },
          { amountCents: 100_000, occurredOn: "2026-10-15" },
          { amountCents: 9_000_000, occurredOn: "2026-11-02" },
          { amountCents: 9_000_000, occurredOn: "2026-07-31" },
        ],
        expenses: [
          { amountCents: 95_000, occurredOn: "2026-08-20", categoryId: 1 },
          { amountCents: 95_000, occurredOn: "2026-09-20", categoryId: 1 },
          { amountCents: 95_000, occurredOn: "2026-10-20", categoryId: 1 },
        ],
        categories: [
          { id: 1, name: "Rent", kind: "expense", isEssential: true },
        ],
        goals: [
          {
            id: 1,
            name: "House deposit",
            targetAmountCents: 1_200_000,
            targetDate: "2027-11-04",
            setAsideCents: 0,
            plannedMonthlyCents: 0,
            expectedAnnualReturnBps: null,
          },
        ],
      }),
    );

    expect(snapshot.version).toBe("2026-11-06");
    expect(snapshot.netWorth.netWorthCents).toBe(210_000);
    expect(snapshot.cashflow).toMatchObject({
      trailingMonths: 3,
      incomeCents: 300_000,
      expenseCents: 285_000,
      surplusCents: 15_000,
      savingsRate: 15_000 / 300_000,
      essentialMonthlyAverageCents: 100_000,
      discretionaryShareOfExpenses: 0,
      uncategorizedExpenseShare: 0,
    });
    expect(snapshot.emergencyFund.gapCents).toBe(500_000);
    expect(snapshot.goals[0]).toMatchObject({
      name: "House deposit",
      status: "shortfall",
      remainingCents: 1_200_000,
    });
    expect(snapshot.allocation).toEqual({
      targetBand: { cash: 0, bonds: 0, equities: 0, other: 0 },
      currentMix: { cash: 0, bonds: 0, equities: 0, other: 0 },
      shortGoalRemainingCents: 0,
      emergencyReservedCents: 0,
      shortGoalReservedCents: 0,
    });
    expect(snapshot.findings.map((finding) => finding.id)).toEqual([
      "low_savings_rate",
      "emergency_fund_gap",
      "goal_shortfall",
    ]);

    const tips = renderTipTemplates(snapshot.findings);
    expect(tips.map((tip) => tip.findingId)).toEqual([
      "low_savings_rate",
      "emergency_fund_gap",
      "goal_shortfall",
    ]);
    expect(tips[0]?.body).toContain("5%");
  });

  it("classifies a planned contribution at 80% of required as tight", () => {
    const snapshot = buildFinancialSnapshot(
      snapshotInput({
        emergencyFund: {
          targetMonths: 3,
          essentialMonthlyAverageCents: 0,
          targetCents: 0,
          eligibleCents: 0,
          fundedRatio: null,
          gapCents: 0,
          avgMonthlySurplusCents: 0,
          monthsToCloseGap: null,
        },
        goals: [
          {
            id: 2,
            name: "Holiday",
            targetAmountCents: 12_000,
            targetDate: "2027-11-04",
            setAsideCents: 0,
            plannedMonthlyCents: 800,
            expectedAnnualReturnBps: null,
          },
        ],
      }),
    );

    expect(snapshot.goals[0]?.requiredMonthlyCents).toBe(1_000);
    expect(snapshot.goals[0]?.status).toBe("tight");
    expect(snapshot.findings.map((finding) => finding.id)).toEqual([
      "goal_tight",
    ]);
  });
});
