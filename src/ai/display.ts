import { formatBps, formatRatio } from "@/lib/percent";
import { formatMoney } from "@/lib/money";

/** One-decimal percent from a 0–1 ratio. */
export function formatRatioPercent(value: number | null): string | null {
  return formatRatio(value);
}

/** Whole or signed percentage points already stored as integers. */
export function formatWholePercent(value: number): string {
  return `${value}%`;
}

/** Drift in percentage points (can be negative). */
export function formatDriftPp(value: number): string {
  return `${value} pp`;
}

/** Basis points (e.g. 300) as an annual percent string using integer arithmetic. */
export function formatBpsPercent(bps: number | null): string | null {
  return formatBps(bps);
}

export function formatCentsMoney(
  cents: number | null | undefined,
  currency: string,
): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return null;
  }
  return formatMoney(cents, currency);
}

export const FINDING_GLOSS: Record<string, string> = {
  low_savings_rate: "savings rate below the warning threshold",
  high_discretionary: "discretionary share of expenses is high",
  uncategorized_expenses: "too many expenses lack a category",
  emergency_fund_gap: "emergency fund is below its target",
  emergency_fund_met: "emergency fund meets its target",
  goal_shortfall: "one or more goals are behind the calculated monthly amount",
  goal_tight: "one or more goals are close to the calculated monthly amount",
  negative_surplus: "expenses exceeded income over the trailing window",
  allocation_drift: "one or more allocation sleeves have drifted beyond the target band",
  cash_concentration: "an unusually high share of assets is held in cash",
  liability_ratio: "liabilities are more than half of total assets",
  stale_snapshots: "one or more assets have not been updated recently",
  overspend_budget: "one or more expense categories have exceeded their monthly budget",
  budget_warning: "one or more expense categories are approaching their monthly budget limit",
};

export const STATUS_GLOSS: Record<string, string> = {
  on_track: "current pace covers the required monthly contribution",
  tight: "current pace is close to but below the required monthly contribution",
  shortfall: "current pace is behind the calculated monthly amount",
};

export const BUCKET_GLOSS: Record<string, string> = {
  short: "short horizon (under two years)",
  mid: "medium horizon",
  long: "long horizon",
};

export const PRIORITY_GLOSS: Record<string, string> = {
  build_emergency_fund: "fill the emergency gap before adding risk",
  reserve_short_goals: "keep short-horizon goal money in cash-like holdings",
  align_to_band: "move the investable mix toward the profile band",
};
