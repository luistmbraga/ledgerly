import { summarizeInterest, type InterestSummary } from "@/domain/interest";
import type { RatedBalance } from "@/domain/projection";
import { listAssets } from "@/db/repositories/assets";
import { listLiabilities } from "@/db/repositories/liabilities";
import {
  getLatestSnapshotsByAssetIds,
  getLatestSnapshotsByLiabilityIds,
} from "@/db/repositories/snapshots";

export type AccountRates = {
  /** Assets with a recorded rate and a positive latest balance, for the projection. */
  ratedBalances: RatedBalance[];
  summary: InterestSummary;
};

/** Read-only: recorded rates with each account's latest balance. */
export function getAccountRates(): AccountRates {
  const assets = listAssets();
  const liabilities = listLiabilities();
  const latestAsset = getLatestSnapshotsByAssetIds(assets.map((a) => a.id));
  const latestLiability = getLatestSnapshotsByLiabilityIds(liabilities.map((l) => l.id));

  const assetAccounts = assets.map((asset) => ({
    name: asset.name,
    balanceCents: latestAsset.get(asset.id)?.amountCents ?? 0,
    annualRateBps: asset.annualRateBps,
  }));

  return {
    ratedBalances: assetAccounts
      .filter((a) => a.annualRateBps !== null && a.balanceCents > 0)
      .map((a) => ({ balanceCents: a.balanceCents, annualRateBps: a.annualRateBps as number })),
    summary: summarizeInterest(
      assetAccounts,
      liabilities.map((liability) => ({
        name: liability.name,
        balanceCents: latestLiability.get(liability.id)?.amountCents ?? 0,
        annualRateBps: liability.annualRateBps,
      })),
    ),
  };
}
