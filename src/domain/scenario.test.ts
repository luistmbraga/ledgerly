import { describe, expect, it } from "vitest";
import { SCENARIOS, projectNetWorth } from "./projection";
import {
  NO_ADJUSTMENTS,
  WHAT_IF_HORIZON_YEARS,
  applyAdjustments,
  computeWhatIfOutcome,
  isEmptyAdjustments,
  runWhatIf,
  type WhatIfAdjustments,
  type WhatIfBaseline,
} from "./scenario";

const AS_OF = "2026-01-15";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function baseline(overrides: Partial<WhatIfBaseline> = {}): WhatIfBaseline {
  return {
    asOf: AS_OF,
    netWorthCents: 5_000_000,
    avgMonthlySurplusCents: 50_000,
    avgMonthlyIncomeCents: 300_000,
    avgMonthlyExpenseCents: 250_000,
    essentialMonthlyAverageCents: 100_000,
    emergencyFund: { targetCents: 600_000, eligibleCents: 400_000 },
    goals: [],
    ...overrides,
  };
}

function adjust(overrides: Partial<WhatIfAdjustments> = {}): WhatIfAdjustments {
  return { ...NO_ADJUSTMENTS, ...overrides };
}

describe("runWhatIf with no adjustments", () => {
  it("returns a scenario equal to the baseline with all-zero diffs", () => {
    const result = runWhatIf(
      baseline({
        goals: [
          {
            id: 1,
            name: "Car",
            targetAmountCents: 1_200_000,
            targetDate: "2027-01-15",
            setAsideCents: 0,
            plannedMonthlyCents: null,
            expectedAnnualReturnBps: null,
          },
        ],
      }),
      NO_ADJUSTMENTS,
    );

    expect(result.scenario).toEqual(result.baseline);
    expect(result.diff.netWorthCents).toBe(0);
    expect(result.diff.avgMonthlySurplusCents).toBe(0);
    expect(result.diff.savingsRate).toBe(0);
    expect(result.diff.emergencyFund).toEqual({
      eligibleCents: 0,
      gapCents: 0,
      monthsToClose: 0,
    });
    expect(result.diff.runwayMonths).toBe(0);
    expect(result.diff.goals.every((g) => !g.statusChanged)).toBe(true);
    for (const projection of result.diff.projections) {
      expect(projection.milestones.every((m) => m.netWorthCents === 0)).toBe(true);
    }
    expect(isEmptyAdjustments(NO_ADJUSTMENTS)).toBe(true);
  });

  it("matches the existing calculators for the baseline", () => {
    const { baseline: outcome } = runWhatIf(baseline(), NO_ADJUSTMENTS);

    expect(outcome.avgMonthlySurplusCents).toBe(50_000);
    expect(outcome.savingsRate).toBeCloseTo(50_000 / 300_000, 12);
    expect(outcome.emergencyFund.gapCents).toBe(200_000);
    // 200_000 / 50_000 = 4 months from 2026-01-15
    expect(outcome.emergencyFund.close).toEqual({
      monthsToClose: 4,
      closeDate: "2026-05-15",
    });
    expect(outcome.runway).toEqual({ months: 50 });
    expect(outcome.debt).toBeNull();
    for (const { key, returnBps } of SCENARIOS) {
      const projection = outcome.projections.find((p) => p.key === key);
      expect(projection?.milestones).toEqual(
        projectNetWorth(5_000_000, 50_000, returnBps, WHAT_IF_HORIZON_YEARS),
      );
    }
  });
});

describe("purity", () => {
  it("does not mutate a frozen baseline or frozen adjustments", () => {
    const frozenBaseline = deepFreeze(
      baseline({
        goals: [
          {
            id: 1,
            name: "Car",
            targetAmountCents: 1_200_000,
            targetDate: "2027-01-15",
            setAsideCents: 0,
            plannedMonthlyCents: null,
            expectedAnnualReturnBps: null,
          },
        ],
      }),
    );
    const frozenAdjustments = deepFreeze(
      adjust({
        income: { kind: "percent", bps: 1000 },
        spending: { kind: "amount", cents: -10_000 },
        oneOffCents: -100_000,
        debt: { balanceCents: 1_000_000, extraMonthlyCents: 20_000, annualRateBps: 300 },
      }),
    );
    const copy = structuredClone(frozenBaseline);

    expect(() => runWhatIf(frozenBaseline, frozenAdjustments)).not.toThrow();
    expect(frozenBaseline).toEqual(copy);
  });

  it("gives deep-equal output for the same input", () => {
    const adjustments = adjust({
      income: { kind: "percent", bps: 1000 },
      oneOffCents: 250_000,
      debt: { balanceCents: 1_000_000, extraMonthlyCents: 20_000, annualRateBps: 300 },
    });
    expect(runWhatIf(baseline(), adjustments)).toEqual(
      runWhatIf(baseline(), adjustments),
    );
  });
});

describe("income and spending levers", () => {
  it("raises surplus by 10% of income", () => {
    const result = runWhatIf(
      baseline(),
      adjust({ income: { kind: "percent", bps: 1000 } }),
    );
    // 300_000 × 10% = 30_000
    expect(result.scenario.avgMonthlySurplusCents).toBe(80_000);
    expect(result.diff.avgMonthlySurplusCents).toBe(30_000);
    expect(result.scenario.savingsRate).toBeCloseTo(80_000 / 330_000, 12);
    // gap 200_000 / 80_000 → 3 months
    expect(result.scenario.emergencyFund.close?.monthsToClose).toBe(3);
    expect(result.diff.emergencyFund.monthsToClose).toBe(-1);
  });

  it("raises surplus when spending is cut 10%, leaving the fund target and runway alone", () => {
    const result = runWhatIf(
      baseline(),
      adjust({ spending: { kind: "percent", bps: -1000 } }),
    );
    // 250_000 × −10% = −25_000 spending → +25_000 surplus
    expect(result.scenario.avgMonthlySurplusCents).toBe(75_000);
    expect(result.scenario.emergencyFund.gapCents).toBe(200_000);
    expect(result.scenario.runway).toEqual(result.baseline.runway);
    expect(result.diff.runwayMonths).toBe(0);
  });

  it("rounds percent deltas half away from zero", () => {
    // 333 × 15% = 49.95 → 50; 333 × −15% → −50
    const up = applyAdjustments(
      baseline({ avgMonthlyIncomeCents: 333 }),
      adjust({ income: { kind: "percent", bps: 1500 } }),
    );
    const down = applyAdjustments(
      baseline({ avgMonthlyIncomeCents: 333 }),
      adjust({ income: { kind: "percent", bps: -1500 } }),
    );
    expect(up.avgMonthlySurplusCents).toBe(50_050);
    expect(down.avgMonthlySurplusCents).toBe(49_950);
  });

  it("accepts amount changes when the income/expense split is unknown", () => {
    const result = runWhatIf(
      baseline({ avgMonthlyIncomeCents: null, avgMonthlyExpenseCents: null }),
      adjust({
        income: { kind: "amount", cents: 20_000 },
        spending: { kind: "amount", cents: 5_000 },
      }),
    );
    expect(result.scenario.avgMonthlySurplusCents).toBe(65_000);
    expect(result.scenario.savingsRate).toBeNull();
    expect(result.diff.savingsRate).toBeNull();
  });

  it("rejects a percent change when the average is unknown", () => {
    expect(() =>
      runWhatIf(
        baseline({ avgMonthlyIncomeCents: null }),
        adjust({ income: { kind: "percent", bps: 1000 } }),
      ),
    ).toThrowError(expect.objectContaining({ name: "ValidationError" }));
  });

  it("reports no close date when the surplus turns negative", () => {
    const result = runWhatIf(
      baseline(),
      adjust({ spending: { kind: "amount", cents: 80_000 } }),
    );
    expect(result.scenario.avgMonthlySurplusCents).toBe(-30_000);
    expect(result.scenario.emergencyFund.close).toBeNull();
    expect(result.diff.emergencyFund.monthsToClose).toBeNull();
  });
});

describe("one-off lever", () => {
  it("adds a windfall to net worth and liquid cash", () => {
    const result = runWhatIf(baseline(), adjust({ oneOffCents: 250_000 }));
    expect(result.scenario.netWorthCents).toBe(5_250_000);
    expect(result.scenario.emergencyFund.eligibleCents).toBe(650_000);
    expect(result.scenario.emergencyFund.gapCents).toBe(0);
    expect(result.scenario.emergencyFund.close).toBeNull();
    // 5_250_000 / 100_000 = 52 months
    expect(result.diff.runwayMonths).toBe(2);
    // Zero-return projection shifts by exactly the windfall.
    const conservative = result.diff.projections.find((p) => p.key === "conservative");
    expect(conservative?.milestones.map((m) => m.netWorthCents)).toEqual([
      250_000, 250_000, 250_000, 250_000,
    ]);
  });

  it("floors liquid cash at zero for a purchase larger than it", () => {
    const result = runWhatIf(baseline(), adjust({ oneOffCents: -900_000 }));
    expect(result.scenario.netWorthCents).toBe(4_100_000);
    expect(result.scenario.emergencyFund.eligibleCents).toBe(0);
    expect(result.scenario.emergencyFund.gapCents).toBe(600_000);
    expect(result.diff.emergencyFund.gapCents).toBe(400_000);
  });
});

describe("goals", () => {
  const car = {
    id: 1,
    name: "Car",
    targetAmountCents: 1_200_000,
    targetDate: "2027-01-15", // 12 full months → 100_000/month required
    setAsideCents: 0,
    plannedMonthlyCents: null,
    expectedAnnualReturnBps: null,
  };

  it("flips a shortfall goal to on track when surplus rises enough", () => {
    const result = runWhatIf(
      baseline({ goals: [car] }),
      adjust({ income: { kind: "amount", cents: 50_000 } }),
    );
    expect(result.baseline.goals[0].status).toBe("shortfall");
    expect(result.scenario.goals[0].status).toBe("on_track");
    expect(result.diff.goals[0]).toEqual({
      id: 1,
      from: "shortfall",
      to: "on_track",
      statusChanged: true,
      allocatedMonthlyCents: 50_000,
    });
    expect(result.baseline.portfolioVerdict).toBe("underfunded");
    expect(result.scenario.portfolioVerdict).toBe("fully_funded");
  });

  it("flips an on-track goal to shortfall when an extra debt payment takes the surplus", () => {
    const result = runWhatIf(
      baseline({ avgMonthlySurplusCents: 100_000, goals: [car] }),
      adjust({
        debt: { balanceCents: 10_000_000, extraMonthlyCents: 40_000, annualRateBps: 300 },
      }),
    );
    expect(result.baseline.goals[0].status).toBe("on_track");
    // 60_000 free surplus < 80% of 100_000
    expect(result.scenario.goals[0].status).toBe("shortfall");
    expect(result.scenario.avgMonthlySurplusCents).toBe(60_000);
  });

  it("leaves a planned-contribution goal untouched by surplus changes", () => {
    const result = runWhatIf(
      baseline({ goals: [{ ...car, plannedMonthlyCents: 100_000 }] }),
      adjust({ spending: { kind: "amount", cents: 40_000 } }),
    );
    expect(result.diff.goals[0].statusChanged).toBe(false);
    expect(result.scenario.goals[0].status).toBe("on_track");
  });
});

describe("debt lever", () => {
  it("equals the plain projection when the extra payment is zero", () => {
    const inputs = applyAdjustments(
      baseline(),
      adjust({
        debt: { balanceCents: 1_000_000, extraMonthlyCents: 0, annualRateBps: 400 },
      }),
    );
    const outcome = computeWhatIfOutcome(inputs);
    for (const { key, returnBps } of SCENARIOS) {
      expect(outcome.projections.find((p) => p.key === key)?.milestones).toEqual(
        projectNetWorth(5_000_000, 50_000, returnBps, WHAT_IF_HORIZON_YEARS),
      );
    }
    expect(outcome.debt?.every((m) => m.interestAvoidedCents === 0)).toBe(true);
    expect(outcome.avgMonthlySurplusCents).toBe(50_000);
  });

  it("is net-worth neutral at a zero debt rate and zero investment return", () => {
    const result = runWhatIf(
      baseline(),
      adjust({
        debt: { balanceCents: 10_000_000, extraMonthlyCents: 20_000, annualRateBps: 0 },
      }),
    );
    const conservative = result.diff.projections.find((p) => p.key === "conservative");
    expect(conservative?.milestones.every((m) => m.netWorthCents === 0)).toBe(true);
    expect(result.scenario.debt?.[0]).toEqual({
      years: 1,
      reductionCents: 240_000,
      extraPaidCents: 240_000,
      interestAvoidedCents: 0,
    });
  });

  it("compounds the reduction at the debt rate", () => {
    // 1200 bps = 1%/month, 10_000/month extra.
    // m1: 10_000; m2: round(10_000×1.01)+10_000 = 20_100; m3: round(20_100×1.01)+10_000 = 30_301
    // Continue to month 12 by hand-rolled loop below.
    let expected = 0;
    for (let m = 0; m < 12; m++) expected = Math.round(expected * 1.01) + 10_000;
    expect(expected).toBe(126_825);

    const result = runWhatIf(
      baseline(),
      adjust({
        debt: { balanceCents: 100_000_000, extraMonthlyCents: 10_000, annualRateBps: 1200 },
      }),
    );
    expect(result.scenario.debt?.[0]).toEqual({
      years: 1,
      reductionCents: 126_825,
      extraPaidCents: 120_000,
      interestAvoidedCents: 6_825,
    });
    // At zero investment return the net-worth gain is exactly the interest avoided.
    const conservative = result.diff.projections.find((p) => p.key === "conservative");
    expect(conservative?.milestones[0].netWorthCents).toBe(6_825);
  });

  it("caps the reduction at the balance and returns the surplus afterwards", () => {
    // Balance 50_000, extra 20_000/month, no interest: paid off in month 3 (20k, 20k, 10k).
    const result = runWhatIf(
      baseline(),
      adjust({
        debt: { balanceCents: 50_000, extraMonthlyCents: 20_000, annualRateBps: 0 },
      }),
    );
    for (const milestone of result.scenario.debt ?? []) {
      expect(milestone.reductionCents).toBe(50_000);
      expect(milestone.extraPaidCents).toBe(50_000);
    }
    // Zero return: invested path lost exactly 50_000, reduction gives it back.
    const conservative = result.diff.projections.find((p) => p.key === "conservative");
    expect(conservative?.milestones.every((m) => m.netWorthCents === 0)).toBe(true);
  });

  it("never lets the reduction exceed the balance when interest would overshoot", () => {
    const result = runWhatIf(
      baseline(),
      adjust({
        debt: { balanceCents: 300_000, extraMonthlyCents: 20_000, annualRateBps: 2400 },
      }),
    );
    for (const milestone of result.scenario.debt ?? []) {
      expect(milestone.reductionCents).toBeLessThanOrEqual(300_000);
      expect(milestone.extraPaidCents).toBeLessThanOrEqual(300_000);
    }
    expect(result.scenario.debt?.at(-1)?.reductionCents).toBe(300_000);
  });

  it("rejects negative debt inputs", () => {
    const bad = [
      { balanceCents: 1000, extraMonthlyCents: -1, annualRateBps: 0 },
      { balanceCents: 1000, extraMonthlyCents: 1, annualRateBps: -1 },
      { balanceCents: -1, extraMonthlyCents: 1, annualRateBps: 0 },
    ];
    for (const debt of bad) {
      expect(() => runWhatIf(baseline(), adjust({ debt }))).toThrowError(
        expect.objectContaining({ name: "ValidationError" }),
      );
    }
  });
});

describe("rated balances", () => {
  const rated = [{ balanceCents: 2_000_000, annualRateBps: 300 }];

  it("matches the rated projection with no adjustments", () => {
    const outcome = computeWhatIfOutcome(
      applyAdjustments(baseline({ ratedBalances: rated }), NO_ADJUSTMENTS),
    );
    for (const { key, returnBps } of SCENARIOS) {
      expect(outcome.projections.find((p) => p.key === key)?.milestones).toEqual(
        projectNetWorth(5_000_000, 50_000, returnBps, WHAT_IF_HORIZON_YEARS, rated),
      );
    }
  });

  it("keeps the rated projection with a zero extra debt payment", () => {
    const outcome = computeWhatIfOutcome(
      applyAdjustments(
        baseline({ ratedBalances: rated }),
        adjust({
          debt: { balanceCents: 1_000_000, extraMonthlyCents: 0, annualRateBps: 400 },
        }),
      ),
    );
    for (const { key, returnBps } of SCENARIOS) {
      expect(outcome.projections.find((p) => p.key === key)?.milestones).toEqual(
        projectNetWorth(5_000_000, 50_000, returnBps, WHAT_IF_HORIZON_YEARS, rated),
      );
    }
  });

  it("puts a one-off amount into the unrated rest", () => {
    const result = runWhatIf(
      baseline({ ratedBalances: rated }),
      adjust({ oneOffCents: 100_000 }),
    );
    const conservative = result.diff.projections.find((p) => p.key === "conservative");
    // 0% on the rest: the windfall stays exactly 100_000 ahead.
    expect(conservative?.milestones.every((m) => m.netWorthCents === 100_000)).toBe(true);
  });

  it("does not mutate the baseline's rated balances", () => {
    const frozen = deepFreeze(baseline({ ratedBalances: rated.map((r) => ({ ...r })) }));
    expect(() => runWhatIf(frozen, adjust({ oneOffCents: 1 }))).not.toThrow();
  });
});
