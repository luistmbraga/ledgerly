import Link from "next/link";
import { notFound } from "next/navigation";
import { selectLatestSnapshot } from "@/domain/net-worth";
import { getLiability } from "@/db/repositories/liabilities";
import { listSnapshotsForLiability } from "@/db/repositories/snapshots";
import { centsToDecimalInput, formatMoney } from "@/lib/money";
import { todayUtc } from "@/lib/dates";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Flash } from "@/components/flash";
import { SnapshotForm } from "@/components/snapshot-form";
import { formatIsoDate } from "../../assets/labels";
import {
  addLiabilitySnapshotAction,
  deleteLiabilityAction,
  deleteLiabilitySnapshotAction,
  updateLiabilityAction,
  updateLiabilitySnapshotAction,
} from "../actions";
import { LiabilityForm } from "../liability-form";
import { LIABILITY_TYPE_LABELS } from "../labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAVED: Record<string, string> = {
  created: "Liability created. Add a snapshot for the amount owed.",
  updated: "Liability saved.",
  snapshot: "Snapshot added.",
  "snapshot-updated": "Snapshot updated.",
  "snapshot-deleted": "Snapshot deleted.",
};

export default async function LiabilityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; editSnapshot?: string }>;
}) {
  const { id: rawId } = await params;
  const query = await searchParams;
  if (!/^\d+$/.test(rawId)) notFound();
  const liability = getLiability(Number(rawId));
  if (!liability) notFound();

  const currency = getDisplayCurrency();
  const snapshots = listSnapshotsForLiability(liability.id);
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
        <Link href="/liabilities" className="text-teal-900 hover:underline">
          Back to liabilities
        </Link>
      </p>
      <header className="mt-3 border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {liability.name}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          {LIABILITY_TYPE_LABELS[liability.type]}
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-8">
        <Flash error={query.error} message={saved} />

        <section>
          <h2 className="text-lg font-semibold">Current amount owed</h2>
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
              Add a snapshot. Until you do, this liability counts as 0 toward
              net worth.
            </p>
          )}
        </section>

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">New snapshot</h2>
          <div className="mt-4">
            <SnapshotForm
              action={addLiabilitySnapshotAction}
              snapshots={snapshots.map((s) => ({
                id: s.id,
                recordedOn: s.recordedOn,
                amountCents: s.amountCents,
              }))}
              currency={currency}
              defaultDate={today}
              amountLabel="Amount owed"
              amountHint="Enter what you owe as a positive amount."
              submitLabel="Add snapshot"
              hiddenFields={{ liabilityId: liability.id }}
            />
          </div>
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
                    <th className="py-2 pr-4 font-medium">Amount owed</th>
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
                            href={`/liabilities/${liability.id}?editSnapshot=${snapshot.id}`}
                            className="rounded-md border border-stone-300 px-3 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
                          >
                            Edit
                          </Link>
                          <ConfirmDelete
                            action={deleteLiabilitySnapshotAction}
                            id={snapshot.id}
                            dialogKey={`liability-snapshot-${snapshot.id}`}
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
              <div className="mt-3">
                <SnapshotForm
                  action={updateLiabilitySnapshotAction}
                  snapshots={snapshots
                    .filter((s) => s.id !== editingSnapshot.id)
                    .map((s) => ({
                      id: s.id,
                      recordedOn: s.recordedOn,
                      amountCents: s.amountCents,
                    }))}
                  currency={currency}
                  defaultDate={editingSnapshot.recordedOn}
                  amountLabel="Amount owed"
                  amountHint="Enter what you owe as a positive amount."
                  submitLabel="Save snapshot"
                  cancelHref={`/liabilities/${liability.id}`}
                  hiddenFields={{ snapshotId: editingSnapshot.id }}
                  defaults={{
                    amount: centsToDecimalInput(editingSnapshot.amountCents),
                    note: editingSnapshot.note ?? "",
                  }}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="max-w-xl border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Edit liability</h2>
          <div className="mt-4">
            <LiabilityForm
              action={updateLiabilityAction}
              submitLabel="Save liability"
              id={liability.id}
              defaults={{
                name: liability.name,
                type: liability.type,
                notes: liability.notes ?? "",
              }}
            />
          </div>
        </section>

        <section className="border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Delete liability</h2>
          <p className="mt-1 text-sm text-stone-600">
            Deletes this liability and every snapshot recorded for it.
          </p>
          <div className="mt-3">
            <ConfirmDelete
              action={deleteLiabilityAction}
              id={liability.id}
              dialogKey={`liability-${liability.id}`}
              title="Delete liability?"
              body="This removes the liability and all of its value snapshots."
              triggerLabel="Delete liability"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
