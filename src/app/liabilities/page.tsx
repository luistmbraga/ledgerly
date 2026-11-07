import Link from "next/link";
import { LIABILITY_TYPES } from "@/domain/net-worth";
import { listLiabilities } from "@/db/repositories/liabilities";
import { getLatestSnapshotsByLiabilityIds } from "@/db/repositories/snapshots";
import { formatMoney } from "@/lib/money";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import { Flash } from "@/components/flash";
import { createLiabilityAction } from "./actions";
import { LIABILITY_TYPE_LABELS } from "./labels";
import { formatIsoDate } from "../assets/labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAVED: Record<string, string> = {
  deleted: "Liability deleted.",
};

export default async function LiabilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const currency = getDisplayCurrency();
  const liabilities = listLiabilities();
  const latestByLiability = getLatestSnapshotsByLiabilityIds(liabilities.map((l) => l.id));
  const rows = liabilities
    .map((liability) => ({
      liability,
      latest: latestByLiability.get(liability.id) ?? null,
    }))
    .sort((a, b) =>
      a.liability.name.localeCompare(b.liability.name, "en", {
        sensitivity: "base",
      }),
    );
  const saved = params.saved ? SAVED[params.saved] : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Liabilities</h1>
        <p className="mt-1 text-sm text-stone-600">
          Snapshots drive net worth. Amounts are what you owe, stored as a
          positive number.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-8">
        <Flash error={params.error} message={saved} />

        {rows.length === 0 ? (
          <p className="text-sm text-stone-700">
            No liabilities yet. Add your first liability, then record how much
            is owed so it reduces net worth.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-stone-600">
                <tr>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Latest amount owed</th>
                  <th className="py-2 font-medium">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ liability, latest }) => (
                  <tr key={liability.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/liabilities/${liability.id}`}
                        className="font-medium text-teal-900 hover:underline"
                      >
                        {liability.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-stone-700">
                      {LIABILITY_TYPE_LABELS[liability.type]}
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
            {rows.length === 0 ? "Add your first liability" : "Add liability"}
          </h2>
          <form action={createLiabilityAction} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="liability-name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="liability-name"
                name="name"
                type="text"
                required
                maxLength={200}
                autoComplete="off"
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="liability-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="liability-type"
                name="type"
                defaultValue="loan"
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
              <label htmlFor="liability-notes" className="text-sm font-medium">
                Notes
              </label>
              <textarea
                id="liability-notes"
                name="notes"
                rows={2}
                maxLength={2000}
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <button
              type="submit"
              className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Add liability
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
