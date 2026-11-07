import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyInput } from "@/components/money-input";
import { SnapshotDateField } from "@/components/snapshot-date-field";
import { selectLatestSnapshot } from "@/domain/net-worth";
import { getAsset } from "@/db/repositories/assets";
import { listSnapshotsForAsset } from "@/db/repositories/snapshots";
import { formatMoney } from "@/lib/money";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import {
  addAssetSnapshotAction,
  deleteAssetAction,
  updateAssetAction,
} from "../actions";
import { AssetForm } from "../asset-form";
import { ConfirmDelete } from "../confirm-delete";
import {
  ASSET_TYPE_DESCRIPTIONS,
  ASSET_TYPE_LABELS,
  formatIsoDate,
} from "../labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAVED: Record<string, string> = {
  created: "Asset created. Add a snapshot to set its current value.",
  updated: "Asset saved.",
  snapshot: "Snapshot added.",
};

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id: rawId } = await params;
  const query = await searchParams;
  if (!/^\d+$/.test(rawId)) notFound();
  const asset = getAsset(Number(rawId));
  if (!asset) notFound();

  const currency = getDisplayCurrency();
  const snapshots = listSnapshotsForAsset(asset.id);
  const latest = selectLatestSnapshot(snapshots);
  const today = new Date().toISOString().slice(0, 10);
  const saved = query.saved ? SAVED[query.saved] : undefined;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <p className="text-sm">
        <Link href="/assets" className="text-teal-900 hover:underline">
          Back to assets
        </Link>
      </p>
      <header className="mt-3 border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{asset.name}</h1>
        <p className="mt-1 text-sm text-stone-600">
          {ASSET_TYPE_LABELS[asset.type]}
        </p>
        <p className="mt-1 text-sm text-stone-600">
          {ASSET_TYPE_DESCRIPTIONS[asset.type]}
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-8">
        {saved ? (
          <p
            role="status"
            className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
          >
            {saved}
          </p>
        ) : null}
        {query.error ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {query.error}
          </p>
        ) : null}

        <section>
          <h2 className="text-lg font-semibold">Current value</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {formatMoney(latest?.amountCents ?? 0, currency)}
          </p>
          {latest ? (
            <p className="mt-1 text-sm text-stone-600">
              From the snapshot on {formatIsoDate(latest.recordedOn)}. When
              dates match, the newest entry is current.
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-600">
              Add a snapshot. Until you do, this asset counts as 0 toward net
              worth.
            </p>
          )}
        </section>

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">New snapshot</h2>
          <form action={addAssetSnapshotAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="assetId" value={asset.id} />
            <SnapshotDateField
              snapshots={snapshots.map((snapshot) => ({
                id: snapshot.id,
                recordedOn: snapshot.recordedOn,
                amountCents: snapshot.amountCents,
              }))}
              currency={currency}
              defaultDate={today}
            />
            <MoneyInput id="amount" name="amount" label="Amount" />
            <div className="flex flex-col gap-1">
              <label htmlFor="note" className="text-sm font-medium">
                Note
              </label>
              <input
                id="note"
                name="note"
                type="text"
                maxLength={500}
                autoComplete="off"
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <button
              type="submit"
              className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Add snapshot
            </button>
          </form>
        </section>

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Snapshot history</h2>
          {snapshots.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600">No snapshots yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 text-stone-600">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snapshot) => (
                    <tr key={snapshot.id} className="border-b border-stone-100">
                      <td className="py-3 pr-4">
                        {formatIsoDate(snapshot.recordedOn)}
                        {latest?.id === snapshot.id ? (
                          <span className="ml-2 text-xs font-medium text-teal-800">
                            Current
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">
                        {formatMoney(snapshot.amountCents, currency)}
                      </td>
                      <td className="py-3 text-stone-700">
                        {snapshot.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Edit asset</h2>
          <div className="mt-4">
            <AssetForm
              action={updateAssetAction}
              submitLabel="Save asset"
              id={asset.id}
              defaults={{
                name: asset.name,
                type: asset.type,
                isLiquid: asset.isLiquid,
                includeInAllocation: asset.includeInAllocation,
                sleevePercents: asset.sleevePercents,
                notes: asset.notes ?? "",
              }}
            />
          </div>
        </section>

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Delete asset</h2>
          <p className="mt-1 text-sm text-stone-600">
            Deletes this asset and every snapshot recorded for it.
          </p>
          <div className="mt-3">
            <ConfirmDelete
              action={deleteAssetAction}
              id={asset.id}
              title="Delete asset?"
              body="This removes the asset and all of its value snapshots."
              triggerLabel="Delete asset"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
