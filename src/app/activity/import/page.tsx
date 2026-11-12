import Link from "next/link";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Flash } from "@/components/flash";
import { listAssets } from "@/db/repositories/assets";
import { listCategories } from "@/db/repositories/categories";
import { listImportBatches } from "@/db/repositories/imports";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import { formatIsoDate } from "../../assets/labels";
import { undoImportAction } from "./actions";
import { ImportWizard } from "./import-wizard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function count(value: string | undefined): number {
  return value && /^\d{1,5}$/.test(value) ? Number(value) : 0;
}

function savedMessage(params: Record<string, string | undefined>): string | undefined {
  const rows = count(params.rows);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (params.saved === "undone") return `Import undone. ${plural(rows, "entry")} removed.`.replace("entrys", "entries");
  if (params.saved !== "imported") return undefined;
  const parts = [`Imported ${plural(rows, "row")}.`];
  const unlinked = count(params.unlinked);
  if (unlinked > 0) {
    parts.push(`${unlinked} ${unlinked === 1 ? "was" : "were"} imported without the cash link because the account already had a newer balance.`);
  }
  if (params.closing === "written") parts.push("The account balance was updated with the statement's closing balance.");
  if (params.closing === "skipped") parts.push("The closing balance was not added because the account already has a newer balance.");
  return parts.join(" ");
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const currency = getDisplayCurrency();
  const option = (row: { id: number; name: string }) => ({ id: row.id, name: row.name });
  const batches = listImportBatches();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <p className="text-sm">
          <Link href="/activity" className="text-teal-800 underline underline-offset-2 hover:text-teal-900">
            Activity
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Import a bank statement</h1>
        <p className="mt-1 text-sm text-stone-600">
          Upload a statement, review every row, then import. Nothing is saved until you confirm, and
          you can undo an import later.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-8">
        <Flash error={params.error} message={savedMessage(params)} />

        <ImportWizard
          key={new URLSearchParams(
            Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
          ).toString()}
          cashAccounts={listAssets().filter((a) => a.type === "cash").map(option)}
          categories={{
            expense: listCategories("expense").map(option),
            income: listCategories("income").map(option),
          }}
          currency={currency}
        />

        <section aria-labelledby="recent-imports" className="border-t border-stone-200 pt-6">
          <h2 id="recent-imports" className="text-lg font-semibold">
            Recent imports
          </h2>
          {batches.length === 0 ? (
            <p className="mt-2 text-sm text-stone-700">No imports yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 text-stone-600">
                  <tr>
                    <th className="py-2 pr-4 font-medium">File</th>
                    <th className="py-2 pr-4 font-medium">Period</th>
                    <th className="py-2 pr-4 font-medium">Rows</th>
                    <th className="py-2 pr-4 font-medium">Cash account</th>
                    <th className="py-2 pr-4 font-medium">Imported</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-b border-stone-100">
                      <td className="py-3 pr-4">{batch.fileName}</td>
                      <td className="py-3 pr-4">
                        {batch.periodFrom && batch.periodTo
                          ? `${formatIsoDate(batch.periodFrom)} – ${formatIsoDate(batch.periodTo)}`
                          : "—"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{batch.rowCount}</td>
                      <td className="py-3 pr-4">{batch.assetName ?? "—"}</td>
                      <td className="py-3 pr-4">{formatIsoDate(batch.createdAt.slice(0, 10))}</td>
                      <td className="py-3">
                        <ConfirmDelete
                          action={undoImportAction}
                          id={batch.id}
                          dialogKey={`import-${batch.id}`}
                          title="Undo this import?"
                          body={`This deletes the ${batch.rowCount} entries this import added${
                            batch.closingSnapshotId !== null ? " and the closing balance it recorded" : ""
                          }. Entries you added yourself are not touched.`}
                          triggerLabel="Undo"
                          size="sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
