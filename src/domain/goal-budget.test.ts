import { describe, expect, it } from "vitest";
import { computeBudgetCeiling, type BudgetCeilingInput, type BudgetExistingGoal } from "./goal-budget";
import { computeGoalFeasibility } from "./goals";

const AS_OF = "2026-01-15";

function input(overrides: Partial<BudgetCeilingInput> = {}): BudgetCeilingInput {
  return {
    asOfDate: AS_OF,
    targetDate: "2026-07-15",
    avgMonthlySurplusCents: 100_000,
    liquidCents: 0,
    emergencyTargetCents: 0,
    goals: [],
    ...overrides,
  };
}

function existing(overrides: Partial<BudgetExistingGoal> = {}): BudgetExistingGoal {
  return {
    setAsideCents: 0,
    remainingCents: 60_000,
    requiredMonthlyCents: 10_000,
    plannedMonthlyCents: null,
    overdue: false,
    ...overrides,
  };
}

function ceilings(result: ReturnType<typeof computeBudgetCeiling>) {
  return result.tiers.map((t) => t.ceilingCents);
}

describe("computeBudgetCeiling", () => {
  it("with no goals and no spare cash uses the full surplus over the months", () => {
    const result = computeBudgetCeiling(input());
    expect(result.monthsRemaining).toBe(6);
    expect(result.freeMonthlyCents).toBe(100_000);
    expect(result.tiers.map((t) => [t.id, t.sharePercent, t.monthlyCents])).toEqual([
      ["comfortable", 50, 50_000],
      ["balanced", 80, 80_000],
      ["stretch", 100, 100_000],
    ]);
    expect(ceilings(result)).toEqual([300_000, 480_000, 600_000]);
  });

  it("subtracts what existing goals require each month", () => {
    const result = computeBudgetCeiling(
      input({ goals: [existing({ requiredMonthlyCents: 30_000 }), existing({ requiredMonthlyCents: 20_000 })] }),
    );
    expect(result.reservedMonthlyCents).toBe(50_000);
    expect(result.freeMonthlyCents).toBe(50_000);
    expect(result.tiers[2].ceilingCents).toBe(300_000);
  });

  it("uses the planned monthly amount when a goal has one", () => {
    const result = computeBudgetCeiling(
      input({ goals: [existing({ requiredMonthlyCents: 30_000, plannedMonthlyCents: 10_000 })] }),
    );
    expect(result.reservedMonthlyCents).toBe(10_000);
    expect(result.freeMonthlyCents).toBe(90_000);
  });

  it("does not reserve monthly money for overdue or already-funded goals, but keeps their set-aside", () => {
    const result = computeBudgetCeiling(
      input({
        liquidCents: 500_000,
        goals: [
          existing({ overdue: true, setAsideCents: 100_000 }),
          existing({ remainingCents: 0, requiredMonthlyCents: 0, setAsideCents: 50_000 }),
        ],
      }),
    );
    expect(result.reservedMonthlyCents).toBe(0);
    expect(result.goalSetAsideCents).toBe(150_000);
    expect(result.spareCashCents).toBe(350_000);
  });

  it("counts only cash above the emergency fund target and goal set-aside", () => {
    const result = computeBudgetCeiling(
      input({
        liquidCents: 1_000_000,
        emergencyTargetCents: 600_000,
        goals: [existing({ setAsideCents: 100_000 })],
      }),
    );
    expect(result.spareCashCents).toBe(300_000);
    expect(result.tiers.map((t) => t.cashCents)).toEqual([150_000, 240_000, 300_000]);
    expect(result.tiers[0].ceilingCents).toBe(150_000 + 45_000 * 6);
    expect(result.tiers[2].ceilingCents).toBe(300_000 + 90_000 * 6);
  });

  it("gives zero spare cash when cash is below the emergency fund target", () => {
    const result = computeBudgetCeiling(
      input({ liquidCents: 200_000, emergencyTargetCents: 600_000 }),
    );
    expect(result.spareCashCents).toBe(0);
  });

  it("with negative surplus saves nothing; each tier uses its share of spare cash", () => {
    const result = computeBudgetCeiling(
      input({ avgMonthlySurplusCents: -50_000, liquidCents: 800_000, emergencyTargetCents: 600_000 }),
    );
    expect(result.freeMonthlyCents).toBe(0);
    expect(ceilings(result)).toEqual([100_000, 160_000, 200_000]);
  });

  it("when goals need more than the surplus, free monthly is zero", () => {
    const result = computeBudgetCeiling(
      input({ goals: [existing({ requiredMonthlyCents: 150_000 })] }),
    );
    expect(result.freeMonthlyCents).toBe(0);
  });

  it("counts a target in the current month as one month", () => {
    const result = computeBudgetCeiling(input({ targetDate: "2026-01-31" }));
    expect(result.monthsRemaining).toBe(1);
    expect(result.tiers[2].ceilingCents).toBe(100_000);
  });

  it("floors tier cash and monthly amounts to whole cents", () => {
    const result = computeBudgetCeiling(input({ avgMonthlySurplusCents: 333, liquidCents: 333 }));
    expect(result.tiers.map((t) => t.monthlyCents)).toEqual([166, 266, 333]);
    expect(result.tiers.map((t) => t.cashCents)).toEqual([166, 266, 333]);
  });

  it("rejects a date before today", () => {
    expect(() => computeBudgetCeiling(input({ targetDate: "2026-01-14" }))).toThrow(
      "Choose a date from today onward.",
    );
  });

  it("a tier saved as a goal with its monthly as the plan is on track", () => {
    const result = computeBudgetCeiling(
      input({
        targetDate: "2027-01-15",
        avgMonthlySurplusCents: 123_457,
        liquidCents: 900_000,
        emergencyTargetCents: 600_000,
      }),
    );
    for (const tier of result.tiers) {
      const feasibility = computeGoalFeasibility(
        {
          targetAmountCents: tier.ceilingCents,
          targetDate: "2027-01-15",
          setAsideCents: tier.cashCents,
          plannedMonthlyCents: tier.monthlyCents,
          expectedAnnualReturnBps: null,
        },
        AS_OF,
        0,
      );
      expect(feasibility.requiredMonthlyCents).toBe(tier.monthlyCents);
      expect(feasibility.status).toBe("on_track");
    }
  });
});
