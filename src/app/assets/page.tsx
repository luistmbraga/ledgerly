import Link from "next/link";
import { listAssets } from "@/db/repositories/assets";
import { getLatestSnapshotsByAssetIds } from "@/db/repositories/snapshots";
import { formatMoney } from "@/lib/money";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import { Flash } from "@/components/flash";
import { createAssetAction } from "./actions";
import { AssetForm } from "./asset-form";
import { ASSET_TYPE_LABELS, formatIsoDate } from "./labels";
import { formatBps } from "@/lib/percent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAVED: Record<string, string> = {
  deleted: "Asset deleted.",
};

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const currency = getDisplayCurrency();
  const assets = listAssets();
  const latestByAsset = getLatestSnapshotsByAssetIds(assets.map((a) => a.id));
  const rows = assets
    .map((asset) => ({
      asset,
      latest: latestByAsset.get(asset.id) ?? null,
    }))
    .sort((a, b) =>
      a.asset.name.localeCompare(b.asset.name, "en", { sensitivity: "base" }),
    );
  const saved = params.saved ? SAVED[params.saved] : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
        <p className="mt-1 text-sm text-stone-600">
          Snapshots drive net worth. The latest value is the current one.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-8">
        <Flash error={params.error} message={saved} />

        {rows.length === 0 ? (
          <p className="text-sm text-stone-700">
            No assets yet. Add your first asset, then record a value snapshot
            so it counts toward net worth.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-stone-600">
                <tr>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Latest value</th>
                  <th className="py-2 font-medium">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ asset, latest }) => (
                  <tr key={asset.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/assets/${asset.id}`}
                        className="font-medium text-teal-900 hover:underline"
                      >
                        {asset.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-stone-700">
                      {ASSET_TYPE_LABELS[asset.type]}
                      {asset.annualRateBps !== null ? (
                        <span className="ml-1 text-stone-500">
                          · {formatBps(asset.annualRateBps)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      {formatMoney(latest?.amountCents ?? 0, currency)}
                    </td>
                    <td className="py-3 text-stone-700">
                      {latest ? formatIsoDate(latest.recordedOn) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section className="max-w-xl border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">
            {rows.length === 0 ? "Add your first asset" : "Add asset"}
          </h2>
          <div className="mt-4">
            <AssetForm action={createAssetAction} submitLabel="Add asset" />
          </div>
        </section>
      </div>
    </div>
  );
}
