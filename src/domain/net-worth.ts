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
