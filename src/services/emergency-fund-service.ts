import {
  computeEmergencyFund,
  computeEssentialMonthlyAverage,
  type ContributingAsset,
  type EmergencyFundResult,
  type EssentialSpendSource,
} from "@/domain/emergency-fund";
import { listAssets } from "@/db/repositories/assets";
import { listCategories } from "@/db/repositories/categories";
import { listExpenses } from "@/db/repositories/expenses";
import { listIncomes } from "@/db/repositories/incomes";
import { getSettings } from "@/db/repositories/settings";
import { getLatestSnapshotsByAssetIds } from "@/db/repositories/snapshots";
import { todayUtc } from "@/lib/dates";

export type EmergencyFundAssetLine = ContributingAsset & {
  name: string;
};

export type EmergencyFundView = EmergencyFundResult & {
  currency: string;
  asOfDate: string;
  essentialSpendSource: EssentialSpendSource;
  computedEssentialMonthlyAverageCents: number;
  assets: EmergencyFundAssetLine[];
};

export function getEmergencyFund(asOfDate = todayUtc()): EmergencyFundView {
  const row = getSettings();
  const targetMonths = row?.emergencyFundTargetMonths ?? 6;
  const currency = row?.displayCurrency ?? "EUR";
  const essential = computeEssentialMonthlyAverage(
    listExpenses().map((expense) => ({
      amountCents: expense.amountCents,
      occurredOn: expense.occurredOn,
      categoryId: expense.categoryId,
    })),
    listCategories("expense").map((category) => ({
      id: category.id,
      kind: "expense" as const,
      isEssential: category.isEssential,
    })),
    {
      emergencyFundTargetMonths: targetMonths,
      essentialMonthlySpendOverrideCents:
        row?.essentialMonthlySpendOverrideCents ?? null,
    },
    asOfDate,
  );

  const assetRows = listAssets();
  const latestByAsset = getLatestSnapshotsByAssetIds(assetRows.map((a) => a.id));
  const fund = computeEmergencyFund({
    essentialMonthlyAverageCents: essential.essentialMonthlyAverageCents,
    targetMonths,
    assets: assetRows.map((asset) => {
      const latest = latestByAsset.get(asset.id);
      return {
        id: asset.id,
        isLiquid: asset.isLiquid,
        snapshots: latest
          ? [{ id: latest.id, recordedOn: latest.recordedOn, amountCents: latest.amountCents }]
          : [],
      };
    }),
    incomes: listIncomes().map((income) => ({
      amountCents: income.amountCents,
      occurredOn: income.occurredOn,
    })),
    expenses: listExpenses().map((expense) => ({
      amountCents: expense.amountCents,
      occurredOn: expense.occurredOn,
    })),
    asOfDate,
  });

  const names = new Map(assetRows.map((asset) => [asset.id, asset.name]));
  const assets = fund.contributingAssets
    .map((asset) => ({
      ...asset,
      name: names.get(asset.id) ?? "Asset",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  return {
    ...fund,
    currency,
    asOfDate,
    essentialSpendSource: essential.source,
    computedEssentialMonthlyAverageCents: essential.computedAverageCents,
    assets,
  };
}
