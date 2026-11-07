import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyInput } from "@/components/money-input";
import { SnapshotDateField } from "@/components/snapshot-date-field";
import { selectLatestSnapshot } from "@/domain/net-worth";
import { getAsset } from "@/db/repositories/assets";
import { listSnapshotsForAsset } from "@/db/repositories/snapshots";
import { centsToDecimalInput, formatMoney } from "@/lib/money";
import { todayUtc } from "@/lib/dates";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import {
  addAssetSnapshotAction,
  deleteAssetAction,
  deleteAssetSnapshotAction,
  updateAssetAction,
  updateAssetSnapshotAction,
} from "../actions";
import { AssetForm } from "../asset-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Flash } from "@/components/flash";
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
  "snapshot-updated": "Snapshot updated.",
  "snapshot-deleted": "Snapshot deleted.",
};

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; editSnapshot?: string }>;
}) {
  const { id: rawId } = await params;
  const query = await searchParams;
  if (!/^\d+$/.test(rawId)) notFound();
  const asset = getAsset(Number(rawId));
  if (!asset) notFound();

  const currency = getDisplayCurrency();
  const snapshots = listSnapshotsForAsset(asset.id);
  const latest = selectLatestSnapshot(snapshots);
  const today = todayUtc();
  const saved = query.saved ? SAVED[query.saved] : undefined;
  const editSnapshotId =
    query.editSnapshot && /^\d+$/.test(query.editSnapshot)
      ? Number(query.editSnapshot)
      : null;
  const editingSnapshot = editSnapshotId
    ? snapshots.find((s) => s.id === editSnapshotId) ?? null
    : null;

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
        <Flash error={query.error} message={saved} />

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
                    <th className="py-2 pr-4 font-medium">Note</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
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
                      <td className="py-3 pr-4 text-stone-700">
                        {snapshot.note ?? "—"}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Link
                            href={`/assets/${asset.id}?editSnapshot=${snapshot.id}`}
                            className="rounded-md border border-stone-300 px-3 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
                          >
                            Edit
                          </Link>
                          <ConfirmDelete
                            action={deleteAssetSnapshotAction}
                            id={snapshot.id}
                            dialogKey={`asset-snapshot-${snapshot.id}`}
                            title="Delete this snapshot?"
                            body="Removes the snapshot from history. This cannot be undone."
                            triggerLabel="Delete"
                            size="sm"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {editingSnapshot ? (
            <div className="mt-6 rounded-md border border-stone-200 p-4">
              <h3 className="text-sm font-semibold">
                Edit snapshot — {formatIsoDate(editingSnapshot.recordedOn)}
              </h3>
              <form
                action={updateAssetSnapshotAction}
                className="mt-3 flex flex-col gap-3"
              >
                <input type="hidden" name="snapshotId" value={editingSnapshot.id} />
                <SnapshotDateField
                  snapshots={snapshots
                    .filter((s) => s.id !== editingSnapshot.id)
                    .map((s) => ({
                      id: s.id,
                      recordedOn: s.recordedOn,
                      amountCents: s.amountCents,
                    }))}
                  currency={currency}
                  defaultDate={editingSnapshot.recordedOn}
                />
                <MoneyInput
                  id="edit-snapshot-amount"
                  name="amount"
                  label="Amount"
                  defaultValue={centsToDecimalInput(editingSnapshot.amountCents)}
                />
                <div className="flex flex-col gap-1">
                  <label htmlFor="edit-snapshot-note" className="text-sm font-medium">
                    Note
                  </label>
                  <input
                    id="edit-snapshot-note"
                    name="note"
                    type="text"
                    maxLength={500}
                    autoComplete="off"
                    defaultValue={editingSnapshot.note ?? ""}
                    className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
                  >
                    Save snapshot
                  </button>
                  <Link
                    href={`/assets/${asset.id}`}
                    className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            </div>
          ) : null}
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
              dialogKey={`asset-${asset.id}`}
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
