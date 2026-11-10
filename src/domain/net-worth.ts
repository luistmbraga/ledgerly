import { lastDayOfMonth } from "../lib/dates";

export const ASSET_TYPES = [
  "cash",
  "brokerage",
  "crypto",
  "real_estate",
  "vehicle",
  "retirement",
  "business",
  "receivable",
  "other",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const LIABILITY_TYPES = [
  "mortgage",
  "loan",
  "credit_card",
  "other",
] as const;

export type LiabilityType = (typeof LIABILITY_TYPES)[number];

export type DatedSnapshot = {
  id: number;
  recordedOn: string;
  amountCents: number;
};

export type AssetWithLatest = {
  type: AssetType;
  latestAmountCents: number | null;
};

export type LiabilityWithLatest = {
  latestAmountCents: number | null;
};

export type NetWorthResult = {
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  byAssetType: Record<AssetType, number>;
};

export type NetWorthPoint = {
  date: string;
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
};

export type SeriesEntry = {
  snapshots: readonly DatedSnapshot[];
};

function latestAtOrBefore(
  snapshots: readonly DatedSnapshot[],
  date: string,
): DatedSnapshot | null {
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
  return best;
}

function isoMonthEnd(year: number, month: number): string {
  const d = lastDayOfMonth(year, month);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Returns one net worth data point per calendar month from the earliest snapshot
 * through `asOfDate`. Each point is at month-end, capped at `asOfDate` for the
 * current month. Assets/liabilities without a snapshot yet in a month carry forward
 * their last known value; assets not yet added show zero (no retroactive distortion).
 */
export function computeNetWorthSeries(
  assets: readonly SeriesEntry[],
  liabilities: readonly SeriesEntry[],
  asOfDate: string,
): NetWorthPoint[] {
  let earliest: string | null = null;
  for (const a of assets) {
    for (const s of a.snapshots) {
      if (earliest === null || s.recordedOn < earliest) earliest = s.recordedOn;
    }
  }
  for (const l of liabilities) {
    for (const s of l.snapshots) {
      if (earliest === null || s.recordedOn < earliest) earliest = s.recordedOn;
    }
  }
  if (earliest === null) return [];

  const startYear = Number(earliest.slice(0, 4));
  const startMonth = Number(earliest.slice(5, 7));
  const endYear = Number(asOfDate.slice(0, 4));
  const endMonth = Number(asOfDate.slice(5, 7));

  const points: NetWorthPoint[] = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const rawEnd = isoMonthEnd(year, month);
    const pointDate = rawEnd <= asOfDate ? rawEnd : asOfDate;

    let totalAssetsCents = 0;
    for (const a of assets) {
      totalAssetsCents += latestAtOrBefore(a.snapshots, pointDate)?.amountCents ?? 0;
    }
    let totalLiabilitiesCents = 0;
    for (const l of liabilities) {
      totalLiabilitiesCents += latestAtOrBefore(l.snapshots, pointDate)?.amountCents ?? 0;
    }

    points.push({
      date: pointDate,
      totalAssetsCents,
      totalLiabilitiesCents,
      netWorthCents: totalAssetsCents - totalLiabilitiesCents,
    });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return points;
}

export function isAssetType(value: string): value is AssetType {
  return (ASSET_TYPES as readonly string[]).includes(value);
}

export function isLiabilityType(value: string): value is LiabilityType {
  return (LIABILITY_TYPES as readonly string[]).includes(value);
}

/** Latest snapshot: maximum recordedOn, then largest id. */
export function selectLatestSnapshot<T extends DatedSnapshot>(
  snapshots: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const snapshot of snapshots) {
    if (
      latest === null ||
      snapshot.recordedOn > latest.recordedOn ||
      (snapshot.recordedOn === latest.recordedOn && snapshot.id > latest.id)
    ) {
      latest = snapshot;
    }
  }
  return latest;
}

export function computeNetWorth(
  assetsWithLatest: readonly AssetWithLatest[],
  liabilitiesWithLatest: readonly LiabilityWithLatest[],
): NetWorthResult {
  const byAssetType = Object.fromEntries(
    ASSET_TYPES.map((type) => [type, 0]),
  ) as Record<AssetType, number>;

  let totalAssetsCents = 0;
  for (const asset of assetsWithLatest) {
    const amount = asset.latestAmountCents ?? 0;
    totalAssetsCents += amount;
    byAssetType[asset.type] += amount;
  }

  let totalLiabilitiesCents = 0;
  for (const liability of liabilitiesWithLatest) {
    totalLiabilitiesCents += liability.latestAmountCents ?? 0;
  }

  return {
    totalAssetsCents,
    totalLiabilitiesCents,
    netWorthCents: totalAssetsCents - totalLiabilitiesCents,
    byAssetType,
  };
}
