import { fullMonthsUntil } from "./goals";

export type BudgetTierId = "comfortable" | "balanced" | "stretch";

/** Share of spare cash and of the free monthly surplus each tier assumes you use. */
export const BUDGET_TIERS: ReadonlyArray<{ id: BudgetTierId; sharePercent: number }> = [
  { id: "comfortable", sharePercent: 50 },
  { id: "balanced", sharePercent: 80 },
  { id: "stretch", sharePercent: 100 },
];

/** An existing goal as seen by the budget check. */
export type BudgetExistingGoal = {
  setAsideCents: number;
  remainingCents: number;
  requiredMonthlyCents: number;
  plannedMonthlyCents: number | null;
  overdue: boolean;
};

export type BudgetCeilingInput = {
  asOfDate: string;
  targetDate: string;
  avgMonthlySurplusCents: number;
  /** Liquid balances counted by the emergency fund (eligibleCents). */
  liquidCents: number;
  emergencyTargetCents: number;
  goals: readonly BudgetExistingGoal[];
};

export type BudgetTier = {
  id: BudgetTierId;
  sharePercent: number;
  /** This tier's share of spare cash. */
  cashCents: number;
  monthlyCents: number;
  ceilingCents: number;
};

export type BudgetCeiling = {
  monthsRemaining: number;
  reservedMonthlyCents: number;
  freeMonthlyCents: number;
  /** Total set aside across existing goals; kept out of spare cash. */
  goalSetAsideCents: number;
  spareCashCents: number;
  tiers: BudgetTier[];
};

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

/**
 * Reverse goal: the most you can aim to spend by `targetDate` without
 * touching the emergency fund or what existing goals need. Each tier uses
 * the same share of spare cash and of the free monthly surplus. Flat saving,
 * no investment return.
 */
export function computeBudgetCeiling(input: BudgetCeilingInput): BudgetCeiling {
  if (input.targetDate < input.asOfDate) {
    invalid("Choose a date from today onward.");
  }

  const monthsRemaining = Math.max(1, fullMonthsUntil(input.asOfDate, input.targetDate));

  const reservedMonthlyCents = input.goals
    .filter((g) => !g.overdue && g.remainingCents > 0)
    .reduce((sum, g) => sum + Math.max(0, g.plannedMonthlyCents ?? g.requiredMonthlyCents), 0);

  const freeMonthlyCents = Math.max(0, input.avgMonthlySurplusCents - reservedMonthlyCents);

  const goalSetAsideCents = input.goals.reduce((sum, g) => sum + Math.max(0, g.setAsideCents), 0);

  const spareCashCents = Math.max(
    0,
    input.liquidCents - input.emergencyTargetCents - goalSetAsideCents,
  );

  const tiers = BUDGET_TIERS.map(({ id, sharePercent }) => {
    const cashCents = Math.floor((spareCashCents * sharePercent) / 100);
    const monthlyCents = Math.floor((freeMonthlyCents * sharePercent) / 100);
    return {
      id,
      sharePercent,
      cashCents,
      monthlyCents,
      ceilingCents: cashCents + monthlyCents * monthsRemaining,
    };
  });

  return {
    monthsRemaining,
    reservedMonthlyCents,
    freeMonthlyCents,
    goalSetAsideCents,
    spareCashCents,
    tiers,
  };
}
