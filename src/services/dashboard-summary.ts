import { eq } from "drizzle-orm";
import { computeNetWorth, selectLatestSnapshot } from "@/domain/net-worth";
import type { AssetType, NetWorthResult } from "@/domain/net-worth";
import { db } from "@/db/client";
import { listAssets } from "@/db/repositories/assets";
import { listLiabilities } from "@/db/repositories/liabilities";
import {
  listSnapshotsForAsset,
  listSnapshotsForLiability,
} from "@/db/repositories/snapshots";
import { settings } from "@/db/schema";

export type DashboardSummary = {
  currency: string;
  assetCount: number;
  liabilityCount: number;
  netWorth: NetWorthResult;
  assetTypesPresent: AssetType[];
};

export function getDisplayCurrency(): string {
  const row = db
    .select({ displayCurrency: settings.displayCurrency })
    .from(settings)
    .where(eq(settings.id, 1))
    .get();
  return row?.displayCurrency ?? "EUR";
}

export function getDashboardSummary(): DashboardSummary {
  const assets = listAssets();
  const liabilities = listLiabilities();
  const assetsWithLatest = assets.map((asset) => ({
    type: asset.type,
    latestAmountCents:
      selectLatestSnapshot(listSnapshotsForAsset(asset.id))?.amountCents ??
      null,
  }));
  const liabilitiesWithLatest = liabilities.map((liability) => ({
    latestAmountCents:
      selectLatestSnapshot(listSnapshotsForLiability(liability.id))
        ?.amountCents ?? null,
  }));

  return {
    currency: getDisplayCurrency(),
    assetCount: assets.length,
    liabilityCount: liabilities.length,
    netWorth: computeNetWorth(assetsWithLatest, liabilitiesWithLatest),
    assetTypesPresent: [...new Set(assets.map((asset) => asset.type))],
  };
}
