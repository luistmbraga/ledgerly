import { addMonths } from "@/lib/dates";

export type NetWorthMilestone = {
  years: number;
  netWorthCents: number;
};

export type EmergencyFundCloseResult = {
  monthsToClose: number;
  closeDate: string;
};

export type RunwayResult = {
  months: number;
};

export const SCENARIOS = [
  { key: "conservative" as const, label: "Conservative", returnBps: 0 },
  { key: "balanced" as const, label: "Balanced", returnBps: 400 },
  { key: "growth" as const, label: "Growth", returnBps: 700 },
] as const;

export type ScenarioKey = (typeof SCENARIOS)[number]["key"];

/**
 * One month of the projection: grow the balance, then add the contribution.
 * A zero rate is plain addition, which avoids float noise.
 */
export function stepBalance(
  balanceCents: number,
  monthlyRate: number,
  contributionCents: number,
): number {
  if (monthlyRate > 0) {
    return Math.round(balanceCents * (1 + monthlyRate)) + contributionCents;
  }
  return balanceCents + contributionCents;
}

/** An account balance that grows at its own recorded annual rate. */
export type RatedBalance = {
  balanceCents: number;
  annualRateBps: number;
};

/**
 * Net worth split for the projection: balances with a recorded rate, and the
 * rest of net worth (which may be negative when liabilities exceed it).
 */
export type NetWorthState = {
  restCents: number;
  rated: readonly RatedBalance[];
};

function validationError(message: string): Error {
  const e = new Error(message);
  e.name = "ValidationError";
  return e;
}

/** Split today's net worth into rated balances and the rest. */
export function startNetWorthState(
  netWorthCents: number,
  rated: readonly RatedBalance[] = [],
): NetWorthState {
  let ratedTotal = 0;
  for (const r of rated) {
    if (r.balanceCents < 0) throw validationError("rated balanceCents must be non-negative");
    if (r.annualRateBps < 0) throw validationError("rated annualRateBps must be non-negative");
    ratedTotal += r.balanceCents;
  }
  return {
    restCents: netWorthCents - ratedTotal,
    rated: rated.map((r) => ({ ...r })),
  };
}

/**
 * One month for the whole net worth. Each rated balance grows at its own rate
 * with no contribution; the rest grows at the scenario rate and receives the
 * monthly contribution.
 */
export function stepNetWorth(
  state: NetWorthState,
  monthlyRate: number,
  contributionCents: number,
): NetWorthState {
  return {
    restCents: stepBalance(state.restCents, monthlyRate, contributionCents),
    rated: state.rated.map((r) => ({
      annualRateBps: r.annualRateBps,
      balanceCents: stepBalance(r.balanceCents, r.annualRateBps / 10_000 / 12, 0),
    })),
  };
}

export function netWorthOf(state: NetWorthState): number {
  return state.rated.reduce((sum, r) => sum + r.balanceCents, state.restCents);
}

/**
 * Project net worth at given year milestones for a single return assumption.
 * Rated balances compound at their own rate; the rest of net worth follows
 * balance = round(balance × (1 + monthlyRate)) + surplus.
 * With no rated balances this is the plain single-rate projection.
 * Zero return falls back to linear accumulation to avoid float noise.
 * Throws ValidationError for negative returnBps.
 */
export function projectNetWorth(
  currentNetWorthCents: number,
  avgMonthlySurplusCents: number,
  returnBps: number,
  horizonYears: readonly number[],
  ratedBalances: readonly RatedBalance[] = [],
): NetWorthMilestone[] {
  if (returnBps < 0) throw validationError("returnBps must be non-negative");

  const monthlyRate = returnBps / 10_000 / 12;
  const maxMonths = Math.max(...horizonYears) * 12;
  const targets = new Set(horizonYears.map((y) => y * 12));

  let state = startNetWorthState(currentNetWorthCents, ratedBalances);
  const milestones: NetWorthMilestone[] = [];

  for (let m = 1; m <= maxMonths; m++) {
    state = stepNetWorth(state, monthlyRate, avgMonthlySurplusCents);
    if (targets.has(m)) {
      milestones.push({ years: m / 12, netWorthCents: netWorthOf(state) });
    }
  }

  return milestones;
}

/**
 * Project when the emergency fund gap will close at the current monthly surplus.
 * Returns null when the gap is already zero or the surplus is non-positive.
 */
export function projectEmergencyFundClose(
  gapCents: number,
  avgMonthlySurplusCents: number,
  asOfDate: string,
): EmergencyFundCloseResult | null {
  if (gapCents <= 0) return null;
  if (avgMonthlySurplusCents <= 0) return null;

  const monthsToClose = Math.ceil(gapCents / avgMonthlySurplusCents);
  return {
    monthsToClose,
    closeDate: addMonths(asOfDate, monthsToClose),
  };
}

/**
 * Compute how many months of essential spending the current net worth covers.
 * Returns null when essential spend is zero or negative (can't compute ratio).
 * Returns { months: 0 } when net worth is zero or negative.
 */
export function computeRunway(
  netWorthCents: number,
  essentialMonthlySpendCents: number,
): RunwayResult | null {
  if (essentialMonthlySpendCents <= 0) return null;
  if (netWorthCents <= 0) return { months: 0 };
  return { months: Math.floor(netWorthCents / essentialMonthlySpendCents) };
}
