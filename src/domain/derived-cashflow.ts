import type { DatedSnapshot } from "./net-worth";
import type { DateRange } from "./cashflow";

export type DerivedAssetInput = {
  id: number;
  /** True when the asset has no market component (cashPct === 100). */
  isCash: boolean;
  snapshots: readonly DatedSnapshot[];
};

export type SurplusConfidence = "high" | "estimated" | "insufficient_data";

export type DerivedSurplusResult = {
  surplusCents: number;
  confidence: SurplusConfidence;
  assumptions: readonly string[];
};

/** Integer division, half away from zero. */
function roundHalfAwayFromZero(numerator: number, denominator: number): number {
  const negative = numerator < 0;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  const remainder = absolute % denominator;
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
}

function latestAtOrBefore(
  snapshots: readonly DatedSnapshot[],
  date: string,
): DatedSnapshot | null {
  let best: DatedSnapshot | null = null;
  for (const s of snapshots) {
    if (s.recordedOn <= date) {
      if (best === null || s.recordedOn > best.recordedOn || (s.recordedOn === best.recordedOn && s.id > best.id)) {
        best = s;
      }
    }
  }
  return best;
}

/**
 * Derive implied net cashflow for a single calendar-month range from asset balance deltas.
 *
 * For cash assets: Δbalance is net cashflow (no market component).
 * For investment assets: strip out estimated market return before treating Δbalance as contribution.
 *
 * @param defaultAnnualReturnBps Expected annual return for investment assets, in basis points (default 500 = 5%).
 */
export function deriveMonthSurplus(
  assets: readonly DerivedAssetInput[],
  range: DateRange,
  defaultAnnualReturnBps = 500,
): DerivedSurplusResult {
  // The day before range.start — snapshots up to this date are "opening"
  // We express this by finding snapshots with recordedOn < range.start
  const dayBeforeStart = subtractOneDay(range.start);

  let totalSurplusCents = 0;
  let hasAnyData = false;
  let hasEstimate = false;
  const assumptions: string[] = [];

  const monthlyRate = defaultAnnualReturnBps / 10_000 / 12;

  for (const asset of assets) {
    const closing = latestAtOrBefore(asset.snapshots, range.end);
    if (closing === null) continue; // No data for or before this month end

    const opening = latestAtOrBefore(asset.snapshots, dayBeforeStart);
    const openingAmount = opening?.amountCents ?? 0;
    if (opening === null) hasEstimate = true; // New asset — opening assumed 0

    const delta = closing.amountCents - openingAmount;
    hasAnyData = true;

    if (asset.isCash) {
      totalSurplusCents += delta;
    } else {
      const estimatedReturnCents = roundHalfAwayFromZero(openingAmount * monthlyRate, 1);
      totalSurplusCents += delta - estimatedReturnCents;
      hasEstimate = true;
    }
  }

  if (!hasAnyData) {
    return {
      surplusCents: 0,
      confidence: "insufficient_data",
      assumptions: ["No snapshots found in this period."],
    };
  }

  assumptions.push("Cash balance changes treated as net cashflow.");
  if (hasEstimate && defaultAnnualReturnBps !== 0) {
    assumptions.push(
      `Investment returns estimated at ${defaultAnnualReturnBps / 100}% annually.`,
    );
  }

  return {
    surplusCents: totalSurplusCents,
    confidence: hasEstimate ? "estimated" : "high",
    assumptions,
  };
}

/** Returns the ISO date string for the day before the given date. */
function subtractOneDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
