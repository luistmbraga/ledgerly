import { fullMonthsBetween } from "../lib/dates";

export type HorizonBucket = "short" | "mid" | "long";

export type GoalStatus = "on_track" | "tight" | "shortfall" | "overdue";

export type GoalComparisonSource = "planned" | "surplus";

/** Stored goal fields the feasibility calculator reads. */
export type GoalFeasibilityInput = {
  targetAmountCents: number;
  targetDate: string;
  setAsideCents: number;
  plannedMonthlyCents: number | null;
  expectedAnnualReturnBps: number | null;
};

export type GoalFeasibility = {
  /** Full calendar months from as-of to target. Negative when the target is past. */
  fullMonthsUntilTarget: number;
  /** Denominator for the contribution. At least 1, including a target in the as-of month. */
  monthsRemaining: number;
  remainingCents: number;
  requiredMonthlyCents: number;
  bucket: HorizonBucket;
  status: GoalStatus;
  comparisonSource: GoalComparisonSource;
  comparedMonthlyCents: number;
};

/** Full months from `asOfDate` to `targetDate`. A partial final month does not count. */
export function fullMonthsUntil(asOfDate: string, targetDate: string): number {
  return fullMonthsBetween(asOfDate, targetDate);
}

/** Horizon from months until the target date. Short under 12, mid 12–59, long 60 or more. */
export function horizonBucket(monthsUntilTarget: number): HorizonBucket {
  if (monthsUntilTarget < 12) return "short";
  if (monthsUntilTarget < 60) return "mid";
  return "long";
}

function ceilDiv(numerator: number, denominator: number): number {
  if (numerator <= 0) return 0;
  return Math.floor((numerator + denominator - 1) / denominator);
}

/** Ceil to integer cents, ignoring binary floating-point noise just below an integer. */
function ceilCents(value: number): number {
  return Math.ceil(value - Math.abs(value) * 1e-9);
}

function requiredMonthlyCents(
  goal: GoalFeasibilityInput,
  monthsRemaining: number,
  remainingCents: number,
): number {
  if (remainingCents === 0) return 0;

  const bps = goal.expectedAnnualReturnBps;
  if (bps === null) {
    return ceilDiv(remainingCents, monthsRemaining);
  }
  if (bps < 0) {
    const error = new Error("expectedAnnualReturnBps must be non-negative");
    error.name = "ValidationError";
    throw error;
  }

  const monthlyRate = bps / 10000 / 12;
  if (!Number.isFinite(monthlyRate) || Math.abs(monthlyRate) < 1e-12) {
    return ceilDiv(remainingCents, monthsRemaining);
  }

  const growth = (1 + monthlyRate) ** monthsRemaining;
  const futureSetAside = goal.setAsideCents * growth;
  const need = goal.targetAmountCents - futureSetAside;
  if (need <= 0) return 0;

  const denominator = growth - 1;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) {
    return ceilDiv(remainingCents, monthsRemaining);
  }

  const payment = (need * monthlyRate) / denominator;
  if (!Number.isFinite(payment) || payment <= 0) return 0;
  return ceilCents(payment);
}

function statusFor(
  remainingCents: number,
  required: number,
  comparedMonthlyCents: number,
): GoalStatus {
  if (remainingCents === 0 || required === 0) return "on_track";
  if (comparedMonthlyCents >= required) return "on_track";
  if (comparedMonthlyCents * 100 >= required * 80) return "tight";
  return "shortfall";
}

/** Sum of remaining cents across non-overdue goals in the "short" horizon bucket. */
export function sumShortGoalRemainingCents(
  goals: readonly { bucket: HorizonBucket; remainingCents: number; status?: GoalStatus }[],
): number {
  return goals
    .filter((g) => g.bucket === "short" && g.status !== "overdue")
    .reduce((sum, g) => sum + Math.max(0, g.remainingCents), 0);
}

export type GoalCapacityInput = {
  id: number;
  fullMonthsUntilTarget: number;
  requiredMonthlyCents: number;
  remainingCents: number;
  plannedMonthlyCents: number | null;
};

export type GoalCapacityItem = {
  id: number;
  allocatedMonthlyCents: number;
  status: GoalStatus;
};

export type PortfolioVerdict = "fully_funded" | "partially_funded" | "underfunded";

export type CapacityResult = {
  items: GoalCapacityItem[];
  portfolioVerdict: PortfolioVerdict;
};

/**
 * Distribute `avgMonthlySurplusCents` across surplus-based goals sorted by
 * deadline ascending (soonest first), so goals cannot all claim the same pool.
 * Planned goals (plannedMonthlyCents set) compare against their own plan and
 * do not draw from the pool. Overdue goals (fullMonthsUntilTarget < 0) get
 * status "overdue" and are excluded from the pool.
 */
export function allocateCapacity(
  goals: readonly GoalCapacityInput[],
  avgMonthlySurplusCents: number,
): CapacityResult {
  const surplusGoals = goals
    .filter((g) => g.fullMonthsUntilTarget >= 0 && g.plannedMonthlyCents === null)
    .slice()
    .sort((a, b) => a.fullMonthsUntilTarget - b.fullMonthsUntilTarget);

  let pool = Math.max(0, avgMonthlySurplusCents);
  const allocMap = new Map<number, number>();
  for (const goal of surplusGoals) {
    const allocated = Math.min(pool, goal.requiredMonthlyCents);
    pool -= allocated;
    allocMap.set(goal.id, allocated);
  }

  const items: GoalCapacityItem[] = goals.map((goal) => {
    if (goal.fullMonthsUntilTarget < 0) {
      return { id: goal.id, allocatedMonthlyCents: 0, status: "overdue" };
    }
    if (goal.plannedMonthlyCents !== null) {
      return {
        id: goal.id,
        allocatedMonthlyCents: goal.plannedMonthlyCents,
        status: statusFor(goal.remainingCents, goal.requiredMonthlyCents, goal.plannedMonthlyCents),
      };
    }
    const allocated = allocMap.get(goal.id) ?? 0;
    return {
      id: goal.id,
      allocatedMonthlyCents: allocated,
      status: statusFor(goal.remainingCents, goal.requiredMonthlyCents, allocated),
    };
  });

  const activeItems = items.filter((i) => i.status !== "overdue");
  const portfolioVerdict: PortfolioVerdict =
    activeItems.length === 0
      ? "fully_funded"
      : activeItems.every((i) => i.status === "on_track")
        ? "fully_funded"
        : activeItems.some((i) => i.status === "on_track")
          ? "partially_funded"
          : "underfunded";

  return { items, portfolioVerdict };
}

export function computeGoalFeasibility(
  goal: GoalFeasibilityInput,
  asOfDate: string,
  avgMonthlySurplusCents: number,
): GoalFeasibility {
  const fullMonthsUntilTarget = fullMonthsUntil(asOfDate, goal.targetDate);
  const monthsRemaining = Math.max(1, fullMonthsUntilTarget);
  const remainingCents = Math.max(0, goal.targetAmountCents - goal.setAsideCents);
  const required = requiredMonthlyCents(goal, monthsRemaining, remainingCents);
  const comparisonSource: GoalComparisonSource =
    goal.plannedMonthlyCents === null ? "surplus" : "planned";
  const comparedMonthlyCents =
    goal.plannedMonthlyCents === null
      ? avgMonthlySurplusCents
      : goal.plannedMonthlyCents;

  return {
    fullMonthsUntilTarget,
    monthsRemaining,
    remainingCents,
    requiredMonthlyCents: required,
    bucket: horizonBucket(fullMonthsUntilTarget),
    status:
      fullMonthsUntilTarget < 0
        ? "overdue"
        : statusFor(remainingCents, required, comparedMonthlyCents),
    comparisonSource,
    comparedMonthlyCents,
  };
}
