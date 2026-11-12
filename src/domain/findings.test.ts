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
    savingsRate: null,
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
        savingsRate: 0.09,
      }),
    );
    expect(findings.map((finding) => finding.id)).toEqual(["low_savings_rate"]);
    expect(findings[0]?.severity).toBe("warn");
    expect(findings[0]?.data.savingsRate).toBe(0.09);
  });

  it("does not fire low_savings_rate at exactly 10% or when income is zero", () => {
    expect(
      ids({ incomeCents: 100_000, surplusCents: 10_000, savingsRate: 0.1 }),
    ).not.toContain("low_savings_rate");
    expect(
      ids({ incomeCents: 0, surplusCents: -5_000, savingsRate: null }),
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
        savingsRate: -0.5,
        expenseCents: 150_00,
      }),
    );
    expect(findings.map((finding) => finding.id)).toEqual([
      "low_savings_rate",
      "negative_surplus",
    ]);
    expect(findings[1]?.data.deficitCents).toBe(50_00);
  });

  it("fires allocation_drift when any sleeve exceeds 10pp off target", () => {
    // cash: 50 vs 15 = 35pp drift (worst); equities: 25 vs 45 = 20pp
    const currentMix = { cash: 50, bonds: 20, equities: 25, other: 5 };
    const targetBand = { cash: 15, bonds: 35, equities: 45, other: 5 };
    const finding = buildFindings(inputs({ currentMix, targetBand })).find(
      (f) => f.id === "allocation_drift",
    );
    expect(finding).toBeDefined();
    expect(finding?.data.sleeve).toBe("cash");
    expect(finding?.data.driftPp).toBe(35);
    expect(finding?.data.currentPct).toBe(50);
    expect(finding?.data.targetPct).toBe(15);
  });

  it("does not fire allocation_drift when all sleeves are within 10pp", () => {
    const currentMix = { cash: 15, bonds: 35, equities: 45, other: 5 };
    const targetBand = { cash: 15, bonds: 35, equities: 45, other: 5 };
    expect(ids({ currentMix, targetBand })).not.toContain("allocation_drift");
  });

  it("does not fire allocation_drift at exactly 10pp", () => {
    const currentMix = { cash: 25, bonds: 35, equities: 35, other: 5 };
    const targetBand = { cash: 15, bonds: 35, equities: 45, other: 5 };
    expect(ids({ currentMix, targetBand })).not.toContain("allocation_drift");
  });

  it("does not fire allocation_drift when no profile (targetBand is null)", () => {
    const currentMix = { cash: 90, bonds: 5, equities: 5, other: 0 };
    expect(ids({ currentMix, targetBand: null })).not.toContain("allocation_drift");
  });

  it("fires cash_concentration when cash exceeds 60% and no profile", () => {
    const finding = buildFindings(
      inputs({
        totalAssetsCents: 100_000,
        cashAssetsCents: 65_000,
        targetBand: null,
      }),
    ).find((f) => f.id === "cash_concentration");
    expect(finding).toBeDefined();
    expect(finding?.data.cashRatio).toBeCloseTo(0.65);
  });

  it("does not fire cash_concentration at exactly 60%", () => {
    expect(
      ids({ totalAssetsCents: 100_000, cashAssetsCents: 60_000, targetBand: null }),
    ).not.toContain("cash_concentration");
  });

  it("does not fire cash_concentration when a profile is set", () => {
    const targetBand = { cash: 5, bonds: 15, equities: 75, other: 5 };
    expect(
      ids({ totalAssetsCents: 100_000, cashAssetsCents: 65_000, targetBand }),
    ).not.toContain("cash_concentration");
  });

  it("fires liability_ratio when liabilities exceed 50% of assets", () => {
    const finding = buildFindings(
      inputs({ totalAssetsCents: 100_000, totalLiabilitiesCents: 60_000 }),
    ).find((f) => f.id === "liability_ratio");
    expect(finding).toBeDefined();
    expect(finding?.data.liabilityRatio).toBeCloseTo(0.6);
  });

  it("does not fire liability_ratio at exactly 50%", () => {
    expect(
      ids({ totalAssetsCents: 100_000, totalLiabilitiesCents: 50_000 }),
    ).not.toContain("liability_ratio");
  });

  it("does not fire liability_ratio when assets are zero", () => {
    expect(
      ids({ totalAssetsCents: 0, totalLiabilitiesCents: 50_000 }),
    ).not.toContain("liability_ratio");
  });

  it("fires stale_snapshots when an asset has no snapshot at all", () => {
    const finding = buildFindings(
      inputs({
        asOf: "2026-11-09",
        assetSnapshots: [{ name: "Savings", latestRecordedOn: null }],
      }),
    ).find((f) => f.id === "stale_snapshots");
    expect(finding).toBeDefined();
    expect(finding?.data.count).toBe(1);
    expect(finding?.data.names).toBe("Savings");
  });

  it("fires stale_snapshots when last update is over 90 days ago", () => {
    const finding = buildFindings(
      inputs({
        asOf: "2026-11-09",
        assetSnapshots: [
          { name: "Old account", latestRecordedOn: "2026-07-01" },
          { name: "Fresh account", latestRecordedOn: "2026-10-01" },
        ],
      }),
    ).find((f) => f.id === "stale_snapshots");
    expect(finding).toBeDefined();
    expect(finding?.data.count).toBe(1);
    expect(finding?.data.names).toBe("Old account");
  });

  it("does not fire stale_snapshots when all assets updated within 90 days", () => {
    expect(
      ids({
        asOf: "2026-11-09",
        assetSnapshots: [
          { name: "Account A", latestRecordedOn: "2026-09-01" },
          { name: "Account B", latestRecordedOn: "2026-10-15" },
        ],
      }),
    ).not.toContain("stale_snapshots");
  });

  it("fires stale_snapshots at exactly 91 days but not 90", () => {
    expect(
      ids({
        asOf: "2026-11-09",
        assetSnapshots: [{ name: "Edge", latestRecordedOn: "2026-08-10" }],
      }),
    ).toContain("stale_snapshots");

    expect(
      ids({
        asOf: "2026-11-09",
        assetSnapshots: [{ name: "Edge", latestRecordedOn: "2026-08-11" }],
      }),
    ).not.toContain("stale_snapshots");
  });
});

describe("renderTipTemplates", () => {
  it("renders the low savings template from the finding data", () => {
    const tips = renderTipTemplates(
      buildFindings(inputs({ incomeCents: 100_000, surplusCents: 9_000, savingsRate: 0.09 })),
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

    expect(snapshot.version).toBe("2026-11-12");
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
      "cash_concentration",
    ]);

    const tips = renderTipTemplates(snapshot.findings);
    expect(tips.map((tip) => tip.findingId)).toEqual([
      "low_savings_rate",
      "emergency_fund_gap",
      "goal_shortfall",
      "cash_concentration",
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
    // cash_concentration also fires: snapshotInput has 250k all-cash with no investor profile
    expect(snapshot.findings.map((finding) => finding.id)).toEqual([
      "goal_tight",
      "cash_concentration",
    ]);
  });
});

describe("costly_debt", () => {
  it("fires at or above 8% for a liability with a balance", () => {
    const findings = buildFindings(
      inputs({
        liabilityRates: [
          { name: "Card", balanceCents: 200_000, annualRateBps: 1_800 },
          { name: "Car loan", balanceCents: 500_000, annualRateBps: 800 },
          { name: "Mortgage", balanceCents: 10_000_000, annualRateBps: 350 },
        ],
      }),
    );
    const costly = findings.find((f) => f.id === "costly_debt");
    expect(costly?.data).toMatchObject({
      count: 2,
      names: "Card, Car loan",
      maxRateBps: 1_800,
      balanceCents: 700_000,
      costPerYearCents: 36_000 + 40_000,
    });
  });

  it("ignores unknown rates, low rates and paid-off debts", () => {
    expect(
      ids({
        liabilityRates: [
          { name: "Unknown", balanceCents: 500_000, annualRateBps: null },
          { name: "Low", balanceCents: 500_000, annualRateBps: 799 },
          { name: "Paid", balanceCents: 0, annualRateBps: 2_000 },
        ],
      }),
    ).not.toContain("costly_debt");
  });

  it("renders a template without advice beyond the what-if lever", () => {
    const [tip] = renderTipTemplates(
      buildFindings(
        inputs({ liabilityRates: [{ name: "Card", balanceCents: 200_000, annualRateBps: 1_850 }] }),
      ),
    );
    expect(tip.title).toBe("Costly debt");
    expect(tip.body).toContain("18.5%");
    expect(tip.body).toContain(formatMoney(37_000, "EUR"));
  });
});

describe("idle_cash", () => {
  const target = 600_000;

  it("reports unrated cash above the emergency fund target", () => {
    const findings = buildFindings(
      inputs({
        emergencyTargetCents: target,
        cashAccounts: [
          { name: "Current", balanceCents: 1_000_000, annualRateBps: null },
          { name: "Savings", balanceCents: 300_000, annualRateBps: 250 },
        ],
      }),
    );
    // Total 1_300_000, 700_000 above target; idle 1_000_000 → 700_000 counts.
    expect(findings.find((f) => f.id === "idle_cash")?.data).toMatchObject({
      idleAboveTargetCents: 700_000,
      names: "Current",
    });
  });

  it("limits the reported amount to the idle cash", () => {
    const findings = buildFindings(
      inputs({
        emergencyTargetCents: target,
        cashAccounts: [
          { name: "Current", balanceCents: 200_000, annualRateBps: 0 },
          { name: "Savings", balanceCents: 2_000_000, annualRateBps: 250 },
        ],
      }),
    );
    expect(findings.find((f) => f.id === "idle_cash")?.data.idleAboveTargetCents).toBe(200_000);
  });

  it("stays quiet when cash is within the target or idle cash is small", () => {
    expect(
      ids({
        emergencyTargetCents: target,
        cashAccounts: [{ name: "Current", balanceCents: 600_000, annualRateBps: null }],
      }),
    ).not.toContain("idle_cash");
    expect(
      ids({
        emergencyTargetCents: target,
        cashAccounts: [{ name: "Current", balanceCents: 650_000, annualRateBps: null }],
      }),
    ).not.toContain("idle_cash");
  });

  it("needs a positive emergency fund target", () => {
    expect(
      ids({
        emergencyTargetCents: 0,
        cashAccounts: [{ name: "Current", balanceCents: 5_000_000, annualRateBps: null }],
      }),
    ).not.toContain("idle_cash");
  });
});

describe("snapshot interest block", () => {
  it("summarizes recorded rates and feeds the detectors", () => {
    const snapshot = buildFinancialSnapshot(
      snapshotInput({
        interestAssets: [
          { name: "Savings", balanceCents: 1_000_000, annualRateBps: 300, isCash: true },
          { name: "Current", balanceCents: 2_000_000, annualRateBps: null, isCash: true },
        ],
        interestLiabilities: [{ name: "Card", balanceCents: 100_000, annualRateBps: 2_000 }],
      }),
    );
    expect(snapshot.interest).toMatchObject({
      earnedPerYearCents: 30_000,
      ratedAssetCents: 1_000_000,
      weightedAssetRateBps: 300,
      costPerYearCents: 20_000,
    });
    expect(snapshot.findings.map((f) => f.id)).toContain("costly_debt");
  });

  it("is all zeros when no rates are recorded", () => {
    const snapshot = buildFinancialSnapshot(snapshotInput());
    expect(snapshot.interest.earnedPerYearCents).toBe(0);
    expect(snapshot.interest.weightedAssetRateBps).toBeNull();
  });
});
