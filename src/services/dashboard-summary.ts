import { computeNetWorth } from "@/domain/net-worth";
import type { AssetType, NetWorthResult } from "@/domain/net-worth";
import { listAssets } from "@/db/repositories/assets";
import { listLiabilities } from "@/db/repositories/liabilities";
import { getSettings } from "@/db/repositories/settings";
import {
  getLatestSnapshotsByAssetIds,
  getLatestSnapshotsByLiabilityIds,
} from "@/db/repositories/snapshots";

export type DashboardSummary = {
  currency: string;
  assetCount: number;
  liabilityCount: number;
  netWorth: NetWorthResult;
  assetTypesPresent: AssetType[];
};

export function getDisplayCurrency(): string {
  return getSettings()?.displayCurrency ?? "EUR";
}

export function getDashboardSummary(): DashboardSummary {
  const assets = listAssets();
  const liabilities = listLiabilities();
  const latestByAsset = getLatestSnapshotsByAssetIds(assets.map((a) => a.id));
  const latestByLiability = getLatestSnapshotsByLiabilityIds(liabilities.map((l) => l.id));
  const assetsWithLatest = assets.map((asset) => ({
    type: asset.type,
    latestAmountCents: latestByAsset.get(asset.id)?.amountCents ?? null,
  }));
  const liabilitiesWithLatest = liabilities.map((liability) => ({
    latestAmountCents: latestByLiability.get(liability.id)?.amountCents ?? null,
  }));

  return {
    currency: getDisplayCurrency(),
    assetCount: assets.length,
    liabilityCount: liabilities.length,
    netWorth: computeNetWorth(assetsWithLatest, liabilitiesWithLatest),
    assetTypesPresent: [...new Set(assets.map((asset) => asset.type))],
  };
}
