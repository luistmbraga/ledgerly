export type HorizonBucket = "short" | "mid" | "long";

export type GoalStatus = "on_track" | "tight" | "shortfall";

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

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid date: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
  return { year, month, day };
}

/** Full months from `asOfDate` to `targetDate`. A partial final month does not count. */
export function fullMonthsUntil(asOfDate: string, targetDate: string): number {
  const start = parseIsoDate(asOfDate);
  const end = parseIsoDate(targetDate);
  let months = (end.year - start.year) * 12 + (end.month - start.month);
  if (end.day < start.day) months -= 1;
  return months;
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

/** Ceil to integer cents, ignoring binary noise just below an integer. */
function ceilCents(value: number): number {
  return Math.ceil(value - 1e-9);
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
    status: statusFor(remainingCents, required, comparedMonthlyCents),
    comparisonSource,
    comparedMonthlyCents,
  };
}
