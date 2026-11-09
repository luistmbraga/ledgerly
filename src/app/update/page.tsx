import { listAssets } from "@/db/repositories/assets";
import { listLiabilities } from "@/db/repositories/liabilities";
import {
  getLatestSnapshotsByAssetIds,
  getLatestSnapshotsByLiabilityIds,
} from "@/db/repositories/snapshots";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import { todayUtc } from "@/lib/dates";
import { Flash } from "@/components/flash";
import { ASSET_TYPE_LABELS, formatIsoDate } from "@/app/assets/labels";
import { LIABILITY_TYPE_LABELS } from "@/app/liabilities/labels";
import { UpdateForm } from "./update-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAVED_MESSAGES: Record<string, string> = {
  nochange: "No changes — all values matched the current balances.",
};

export default async function UpdateBalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const query = await searchParams;
  const assets = listAssets();
  const liabilities = listLiabilities();
  const currency = getDisplayCurrency();
  const today = todayUtc();

  const latestByAsset = getLatestSnapshotsByAssetIds(assets.map((a) => a.id));
  const latestByLiability = getLatestSnapshotsByLiabilityIds(liabilities.map((l) => l.id));

  const assetRows = assets.map((asset) => {
    const snap = latestByAsset.get(asset.id) ?? null;
    return {
      id: asset.id,
      name: asset.name,
      typeLabel: ASSET_TYPE_LABELS[asset.type],
      isCash: asset.type === "cash",
      latestCents: snap?.amountCents ?? null,
      latestDate: snap ? formatIsoDate(snap.recordedOn) : null,
    };
  });

  const liabilityRows = liabilities.map((liability) => {
    const snap = latestByLiability.get(liability.id) ?? null;
    return {
      id: liability.id,
      name: liability.name,
      typeLabel: LIABILITY_TYPE_LABELS[liability.type],
      isCash: false,
      latestCents: snap?.amountCents ?? null,
      latestDate: snap ? formatIsoDate(snap.recordedOn) : null,
    };
  });

  const savedCount = query.saved && /^\d+$/.test(query.saved) ? Number(query.saved) : null;
  const savedMessage =
    savedCount !== null
      ? `${savedCount} balance${savedCount === 1 ? "" : "s"} updated.`
      : query.saved
        ? (SAVED_MESSAGES[query.saved] ?? undefined)
        : undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <header className="mb-6 border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Update balances</h1>
        <p className="mt-1 text-sm text-stone-600">
          Enter the current value for each asset and liability. Unchanged rows are skipped.
        </p>
      </header>

      {savedMessage && (
        <div className="mb-6">
          <Flash message={savedMessage} />
        </div>
      )}

      <UpdateForm
        assets={assetRows}
        liabilities={liabilityRows}
        currency={currency}
        defaultDate={today}
      />
    </div>
  );
}
