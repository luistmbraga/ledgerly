import type { DatedSnapshot } from "./net-worth";

export type AttributionItem = {
  id: number;
  name: string;
  kind: "asset" | "liability";
  /** Value at or before startDate; null if the entity had no snapshot yet. */
  startCents: number | null;
  /** Value at or before endDate (carry-forward of last known value). */
  endCents: number;
  /** Signed contribution to net-worth delta: positive means net worth up. */
  netWorthContributionCents: number;
  /** True when the entity had no snapshot at or before startDate. */
  isNew: boolean;
};

export type AttributionResult = {
  startDate: string;
  endDate: string;
  netWorthDeltaCents: number;
  items: AttributionItem[];
};

function latestAmountAtOrBefore(
  snapshots: readonly DatedSnapshot[],
  date: string,
): number | null {
  let best: DatedSnapshot | null = null;
  for (const s of snapshots) {
    if (s.recordedOn <= date) {
      if (
        best === null ||
        s.recordedOn > best.recordedOn ||
        (s.recordedOn === best.recordedOn && s.id > best.id)
      ) {
        best = s;
      }
    }
  }
  return best !== null ? best.amountCents : null;
}

export type AttributionAsset = {
  id: number;
  name: string;
  snapshots: readonly DatedSnapshot[];
};

/**
 * Diffs every asset and liability between two dates and ranks contributions to
 * the net-worth delta.
 *
 * Rules:
 * - Entity has no snapshot at all at or before endDate → skip (contributes 0).
 * - Entity has no snapshot at or before startDate (new) → startCents is null,
 *   contribution is computed from 0, isNew is true.
 * - Contributions are guaranteed to sum exactly to netWorthDeltaCents.
 * - Items are sorted by |contribution| descending.
 */
export function computeAttribution(
  assets: readonly AttributionAsset[],
  liabilities: readonly AttributionAsset[],
  startDate: string,
  endDate: string,
): AttributionResult {
  const items: AttributionItem[] = [];
  let netWorthDeltaCents = 0;

  for (const asset of assets) {
    const endCents = latestAmountAtOrBefore(asset.snapshots, endDate);
    if (endCents === null) continue; // no snapshot at or before endDate
    const startCents = latestAmountAtOrBefore(asset.snapshots, startDate);
    const contribution = endCents - (startCents ?? 0);
    netWorthDeltaCents += contribution;
    items.push({
      id: asset.id,
      name: asset.name,
      kind: "asset",
      startCents,
      endCents,
      netWorthContributionCents: contribution,
      isNew: startCents === null,
    });
  }

  for (const liability of liabilities) {
    const endCents = latestAmountAtOrBefore(liability.snapshots, endDate);
    if (endCents === null) continue;
    const startCents = latestAmountAtOrBefore(liability.snapshots, startDate);
    // A liability increase reduces net worth, so the sign is negated.
    const contribution = -((endCents) - (startCents ?? 0));
    netWorthDeltaCents += contribution;
    items.push({
      id: liability.id,
      name: liability.name,
      kind: "liability",
      startCents,
      endCents,
      netWorthContributionCents: contribution,
      isNew: startCents === null,
    });
  }

  items.sort(
    (a, b) =>
      Math.abs(b.netWorthContributionCents) -
      Math.abs(a.netWorthContributionCents),
  );

  return { startDate, endDate, netWorthDeltaCents, items };
}
