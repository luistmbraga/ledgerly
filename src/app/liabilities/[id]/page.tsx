import Link from "next/link";
import { notFound } from "next/navigation";
import { LIABILITY_TYPES, selectLatestSnapshot } from "@/domain/net-worth";
import { MoneyInput } from "@/components/money-input";
import { SnapshotDateField } from "@/components/snapshot-date-field";
import { getLiability } from "@/db/repositories/liabilities";
import { listSnapshotsForLiability } from "@/db/repositories/snapshots";
import { formatMoney } from "@/lib/money";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import { ConfirmDelete } from "../../assets/confirm-delete";
import { formatIsoDate } from "../../assets/labels";
import {
  addLiabilitySnapshotAction,
  deleteLiabilityAction,
  updateLiabilityAction,
} from "../actions";
import { LIABILITY_TYPE_LABELS } from "../labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAVED: Record<string, string> = {
  created: "Liability created. Add a snapshot for the amount owed.",
  updated: "Liability saved.",
  snapshot: "Snapshot added.",
};

export default async function LiabilityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id: rawId } = await params;
  const query = await searchParams;
  if (!/^\d+$/.test(rawId)) notFound();
  const liability = getLiability(Number(rawId));
  if (!liability) notFound();

  const currency = getDisplayCurrency();
  const snapshots = listSnapshotsForLiability(liability.id);
  const latest = selectLatestSnapshot(snapshots);
  const today = new Date().toISOString().slice(0, 10);
  const saved = query.saved ? SAVED[query.saved] : undefined;

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
          <form
            action={addLiabilitySnapshotAction}
            className="mt-4 flex flex-col gap-4"
          >
            <input type="hidden" name="liabilityId" value={liability.id} />
            <SnapshotDateField
              snapshots={snapshots.map((snapshot) => ({
                id: snapshot.id,
                recordedOn: snapshot.recordedOn,
                amountCents: snapshot.amountCents,
              }))}
              currency={currency}
              defaultDate={today}
            />
            <MoneyInput
              id="amount"
              name="amount"
              label="Amount owed"
              hint="Enter what you owe as a positive amount."
            />
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
                    <th className="py-2 pr-4 font-medium">Amount owed</th>
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

        <section className="max-w-xl border-t border-stone-200 pt-6">
          <h2 className="text-lg font-semibold">Edit liability</h2>
          <form action={updateLiabilityAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="id" value={liability.id} />
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="edit-name"
                name="name"
                type="text"
                required
                maxLength={200}
                defaultValue={liability.name}
                autoComplete="off"
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="edit-type"
                name="type"
                defaultValue={liability.type}
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              >
                {LIABILITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {LIABILITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-notes" className="text-sm font-medium">
                Notes
              </label>
              <textarea
                id="edit-notes"
                name="notes"
                rows={2}
                maxLength={2000}
                defaultValue={liability.notes ?? ""}
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <button
              type="submit"
              className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Save liability
            </button>
          </form>
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
