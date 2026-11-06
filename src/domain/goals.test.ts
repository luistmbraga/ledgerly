import { describe, expect, it } from "vitest";
import {
  computeGoalFeasibility,
  fullMonthsUntil,
  horizonBucket,
  type GoalFeasibilityInput,
} from "./goals";

const AS_OF = "2026-01-15";

function goal(
  overrides: Partial<GoalFeasibilityInput> = {},
): GoalFeasibilityInput {
  return {
    targetAmountCents: 12_000,
    targetDate: "2027-01-15",
    setAsideCents: 0,
    plannedMonthlyCents: null,
    expectedAnnualReturnBps: null,
    ...overrides,
  };
}

describe("fullMonthsUntil and horizon buckets", () => {
  it("counts full months and classifies 6 months, 3 years, and 10 years", () => {
    expect(fullMonthsUntil(AS_OF, "2026-07-15")).toBe(6);
    expect(horizonBucket(6)).toBe("short");

    expect(fullMonthsUntil(AS_OF, "2029-01-15")).toBe(36);
    expect(horizonBucket(36)).toBe("mid");

    expect(fullMonthsUntil(AS_OF, "2036-01-15")).toBe(120);
    expect(horizonBucket(120)).toBe("long");
  });

  it("uses the short/mid and mid/long boundaries", () => {
    expect(horizonBucket(11)).toBe("short");
    expect(horizonBucket(12)).toBe("mid");
    expect(horizonBucket(59)).toBe("mid");
    expect(horizonBucket(60)).toBe("long");
  });

  it("drops a partial month when the target day is earlier", () => {
    expect(fullMonthsUntil("2026-01-31", "2026-07-30")).toBe(5);
  });
});

describe("computeGoalFeasibility", () => {
  it("uses a flat monthly contribution rounded up to cents", () => {
    const result = computeGoalFeasibility(
      goal({
        targetAmountCents: 1_000,
        targetDate: "2026-07-15",
        plannedMonthlyCents: 167,
      }),
      AS_OF,
      0,
    );

    expect(result.fullMonthsUntilTarget).toBe(6);
    expect(result.monthsRemaining).toBe(6);
    expect(result.bucket).toBe("short");
    expect(result.remainingCents).toBe(1_000);
    expect(result.requiredMonthlyCents).toBe(167);
    expect(result.status).toBe("on_track");
    expect(result.comparisonSource).toBe("planned");
  });

  it("uses the annuity payment when an annual return is set", () => {
    // 12 months, 6% annual (600 bps), nothing set aside, target 1,200.00.
    // r = 0.005; PMT = 120000 * r / ((1+r)^12 - 1) ≈ 9727.97 → 9728 cents.
    const result = computeGoalFeasibility(
      goal({
        targetAmountCents: 120_000,
        targetDate: "2027-01-15",
        expectedAnnualReturnBps: 600,
        plannedMonthlyCents: 9_728,
      }),
      AS_OF,
      0,
    );

    expect(result.monthsRemaining).toBe(12);
    expect(result.bucket).toBe("mid");
    expect(result.requiredMonthlyCents).toBe(9_728);
    expect(result.status).toBe("on_track");
  });

  it("is on track with no contribution when growth already covers the target", () => {
    const result = computeGoalFeasibility(
      goal({
        targetAmountCents: 106_000,
        setAsideCents: 100_000,
        targetDate: "2027-01-15",
        expectedAnnualReturnBps: 600,
        plannedMonthlyCents: 0,
      }),
      AS_OF,
      0,
    );

    expect(result.remainingCents).toBe(6_000);
    expect(result.requiredMonthlyCents).toBe(0);
    expect(result.status).toBe("on_track");
  });

  it("falls back to flat division when the monthly rate is zero", () => {
    const flat = computeGoalFeasibility(
      goal({ targetAmountCents: 1_200, plannedMonthlyCents: 100 }),
      AS_OF,
      0,
    );
    const zeroReturn = computeGoalFeasibility(
      goal({
        targetAmountCents: 1_200,
        plannedMonthlyCents: 100,
        expectedAnnualReturnBps: 0,
      }),
      AS_OF,
      0,
    );

    expect(flat.requiredMonthlyCents).toBe(100);
    expect(zeroReturn.requiredMonthlyCents).toBe(100);
  });

  it("marks shortfall when planned monthly is below 80% of required", () => {
    const result = computeGoalFeasibility(
      goal({
        targetAmountCents: 10_000,
        targetDate: "2026-11-15",
        plannedMonthlyCents: 100,
      }),
      AS_OF,
      50_000,
    );

    expect(result.monthsRemaining).toBe(10);
    expect(result.requiredMonthlyCents).toBe(1_000);
    expect(result.status).toBe("shortfall");
    expect(result.comparedMonthlyCents).toBe(100);
  });

  it("marks tight at 80% of required and on track at the required amount", () => {
    const tight = computeGoalFeasibility(
      goal({
        targetAmountCents: 10_000,
        targetDate: "2026-11-15",
        plannedMonthlyCents: 800,
      }),
      AS_OF,
      0,
    );
    const onTrack = computeGoalFeasibility(
      goal({
        targetAmountCents: 10_000,
        targetDate: "2026-11-15",
        plannedMonthlyCents: 1_000,
      }),
      AS_OF,
      0,
    );

    expect(tight.requiredMonthlyCents).toBe(1_000);
    expect(tight.status).toBe("tight");
    expect(onTrack.status).toBe("on_track");
  });

  it("is on track when set aside equals the target", () => {
    const result = computeGoalFeasibility(
      goal({
        targetAmountCents: 5_000,
        setAsideCents: 5_000,
        plannedMonthlyCents: 0,
      }),
      AS_OF,
      -1,
    );

    expect(result.remainingCents).toBe(0);
    expect(result.requiredMonthlyCents).toBe(0);
    expect(result.status).toBe("on_track");
  });

  it("compares trailing surplus when no planned monthly is set", () => {
    const shortfall = computeGoalFeasibility(
      goal({
        targetAmountCents: 10_000,
        targetDate: "2026-11-15",
        plannedMonthlyCents: null,
      }),
      AS_OF,
      799,
    );
    const tight = computeGoalFeasibility(
      goal({
        targetAmountCents: 10_000,
        targetDate: "2026-11-15",
        plannedMonthlyCents: null,
      }),
      AS_OF,
      800,
    );

    expect(shortfall.comparisonSource).toBe("surplus");
    expect(shortfall.status).toBe("shortfall");
    expect(tight.status).toBe("tight");
    expect(tight.comparedMonthlyCents).toBe(800);
  });

  it("assigns bucket badges for 6-month, 3-year, and 10-year targets", () => {
    const short = computeGoalFeasibility(
      goal({ targetDate: "2026-07-15" }),
      AS_OF,
      0,
    );
    const mid = computeGoalFeasibility(
      goal({ targetDate: "2029-01-15" }),
      AS_OF,
      0,
    );
    const long = computeGoalFeasibility(
      goal({ targetDate: "2036-01-15" }),
      AS_OF,
      0,
    );

    expect(short.bucket).toBe("short");
    expect(mid.bucket).toBe("mid");
    expect(long.bucket).toBe("long");
  });

  it("uses one month when the target is in the as-of month", () => {
    const result = computeGoalFeasibility(
      goal({
        targetAmountCents: 50,
        targetDate: "2026-01-31",
        setAsideCents: 0,
        plannedMonthlyCents: 50,
      }),
      AS_OF,
      0,
    );

    expect(result.fullMonthsUntilTarget).toBe(0);
    expect(result.monthsRemaining).toBe(1);
    expect(result.bucket).toBe("short");
    expect(result.requiredMonthlyCents).toBe(50);
  });
});
