import { describe, expect, it } from "vitest";
import {
  allocateCapacity,
  computeGoalFeasibility,
  fullMonthsUntil,
  horizonBucket,
  sumShortGoalRemainingCents,
  type GoalCapacityInput,
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

  it("month-end rule: Jan 31 → Feb 28 counts as 1 full month", () => {
    expect(fullMonthsUntil("2026-01-31", "2026-02-28")).toBe(1);
  });

  it("month-end rule: Mar 31 → Apr 30 counts as 1 full month", () => {
    expect(fullMonthsUntil("2026-03-31", "2026-04-30")).toBe(1);
  });

  it("Jan 15 → Feb 15 is still 1 (day matches, no month-end needed)", () => {
    expect(fullMonthsUntil("2026-01-15", "2026-02-15")).toBe(1);
  });

  it("Jan 31 → Feb 27 is 0 (Feb 27 is not month-end)", () => {
    expect(fullMonthsUntil("2026-01-31", "2026-02-27")).toBe(0);
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

  it("rejects a negative expectedAnnualReturnBps with a ValidationError", () => {
    expect(() =>
      computeGoalFeasibility(
        goal({ expectedAnnualReturnBps: -1 }),
        AS_OF,
        0,
      ),
    ).toThrow("expectedAnnualReturnBps must be non-negative");
  });

  it("returns overdue when the target date is in the past", () => {
    const result = computeGoalFeasibility(
      goal({ targetDate: "2025-01-01" }),
      AS_OF,
      1_000,
    );
    expect(result.fullMonthsUntilTarget).toBeLessThan(0);
    expect(result.status).toBe("overdue");
  });
});

describe("sumShortGoalRemainingCents", () => {
  it("excludes overdue goals from the short reserve", () => {
    const goals = [
      { bucket: "short" as const, remainingCents: 1_000, status: "on_track" as const },
      { bucket: "short" as const, remainingCents: 2_000, status: "overdue" as const },
      { bucket: "short" as const, remainingCents: 500, status: "shortfall" as const },
    ];
    expect(sumShortGoalRemainingCents(goals)).toBe(1_500);
  });

  it("includes all short non-overdue goals when status is omitted", () => {
    const goals = [
      { bucket: "short" as const, remainingCents: 1_000 },
      { bucket: "mid" as const, remainingCents: 2_000 },
    ];
    expect(sumShortGoalRemainingCents(goals)).toBe(1_000);
  });
});

describe("allocateCapacity", () => {
  function capacityGoal(overrides: Partial<GoalCapacityInput> & { id: number }): GoalCapacityInput {
    return {
      fullMonthsUntilTarget: 12,
      requiredMonthlyCents: 500,
      remainingCents: 6_000,
      plannedMonthlyCents: null,
      ...overrides,
    };
  }

  it("three surplus goals on a €600 surplus cannot all report on_track", () => {
    const goals = [
      capacityGoal({ id: 1, requiredMonthlyCents: 500, fullMonthsUntilTarget: 6 }),
      capacityGoal({ id: 2, requiredMonthlyCents: 500, fullMonthsUntilTarget: 12 }),
      capacityGoal({ id: 3, requiredMonthlyCents: 500, fullMonthsUntilTarget: 24 }),
    ];
    const result = allocateCapacity(goals, 600);
    // Only goal 1 (soonest) gets 500; goal 2 gets 100; goal 3 gets 0
    expect(result.items[0].status).toBe("on_track");
    expect(result.items[1].status).not.toBe("on_track");
    expect(result.items[2].status).not.toBe("on_track");
    expect(result.portfolioVerdict).toBe("partially_funded");
  });

  it("all goals on track when surplus covers all requirements", () => {
    const goals = [
      capacityGoal({ id: 1, requiredMonthlyCents: 200 }),
      capacityGoal({ id: 2, requiredMonthlyCents: 300 }),
    ];
    const result = allocateCapacity(goals, 1_000);
    expect(result.items.every((i) => i.status === "on_track")).toBe(true);
    expect(result.portfolioVerdict).toBe("fully_funded");
  });

  it("overdue goals get overdue status and are excluded from the pool", () => {
    const goals = [
      capacityGoal({ id: 1, fullMonthsUntilTarget: -3, requiredMonthlyCents: 500 }),
      capacityGoal({ id: 2, fullMonthsUntilTarget: 6, requiredMonthlyCents: 400 }),
    ];
    const result = allocateCapacity(goals, 600);
    expect(result.items[0].status).toBe("overdue");
    // Overdue did not consume the pool so goal 2 gets full 400
    expect(result.items[1].status).toBe("on_track");
  });

  it("planned goals compare against their own plan, not the pool", () => {
    const goals = [
      capacityGoal({ id: 1, plannedMonthlyCents: 600, requiredMonthlyCents: 500 }),
      capacityGoal({ id: 2, plannedMonthlyCents: 100, requiredMonthlyCents: 500 }),
    ];
    const result = allocateCapacity(goals, 0);
    expect(result.items[0].status).toBe("on_track"); // 600 >= 500
    expect(result.items[1].status).toBe("shortfall"); // 100 < 400 (80% of 500)
  });

  it("fully_funded when there are no active goals", () => {
    expect(allocateCapacity([], 1_000).portfolioVerdict).toBe("fully_funded");
    const goals = [capacityGoal({ id: 1, fullMonthsUntilTarget: -1 })];
    expect(allocateCapacity(goals, 1_000).portfolioVerdict).toBe("fully_funded");
  });

  it("allocations never exceed available surplus", () => {
    const goals = [
      capacityGoal({ id: 1, requiredMonthlyCents: 1_000, fullMonthsUntilTarget: 3 }),
      capacityGoal({ id: 2, requiredMonthlyCents: 1_000, fullMonthsUntilTarget: 6 }),
    ];
    const result = allocateCapacity(goals, 500);
    const totalAllocated = result.items.reduce((sum, i) => sum + i.allocatedMonthlyCents, 0);
    expect(totalAllocated).toBeLessThanOrEqual(500);
  });
});
