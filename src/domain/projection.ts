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

/**
 * Project net worth at given year milestones for a single return assumption.
 * Per-month formula: balance = round(balance × (1 + monthlyRate)) + surplus.
 * Zero return falls back to linear accumulation to avoid float noise.
 * Throws ValidationError for negative returnBps.
 */
export function projectNetWorth(
  currentNetWorthCents: number,
  avgMonthlySurplusCents: number,
  returnBps: number,
  horizonYears: readonly number[],
): NetWorthMilestone[] {
  if (returnBps < 0) {
    const e = new Error("returnBps must be non-negative");
    e.name = "ValidationError";
    throw e;
  }

  const monthlyRate = returnBps / 10_000 / 12;
  const maxMonths = Math.max(...horizonYears) * 12;
  const targets = new Set(horizonYears.map((y) => y * 12));

  let balance = currentNetWorthCents;
  const milestones: NetWorthMilestone[] = [];

  for (let m = 1; m <= maxMonths; m++) {
    balance = stepBalance(balance, monthlyRate, avgMonthlySurplusCents);
    if (targets.has(m)) {
      milestones.push({ years: m / 12, netWorthCents: balance });
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
