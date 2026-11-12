import Link from "next/link";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SubmitButton } from "@/components/submit-button";
import { listAssets } from "@/db/repositories/assets";
import { listCategories } from "@/db/repositories/categories";
import { listTemplates, type DueItem } from "@/db/repositories/recurring";
import { nextOccurrence, type Cadence } from "@/domain/recurring";
import { centsToDecimalInput, formatMoney } from "@/lib/money";
import { formatIsoDate } from "../assets/labels";
import {
  createTemplateAction,
  deleteTemplateAction,
  postDueAction,
  toggleTemplateAction,
  updateTemplateAction,
} from "./recurring-actions";
import { RecurringForm } from "./recurring-form";

const CADENCE_LABEL: Record<Cadence, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  yearly: "Yearly",
};

const SMALL_BUTTON =
  "rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2";

export function RecurringTab({
  currency,
  editId,
  today,
  due,
}: {
  currency: string;
  editId: number | undefined;
  today: string;
  due: DueItem[];
}) {
  const templates = listTemplates();
  const editing = editId === undefined ? undefined : templates.find((t) => t.id === editId);
  const option = (row: { id: number; name: string }) => ({ id: row.id, name: row.name });
  const expenseCategories = listCategories("expense").map(option);
  const incomeCategories = listCategories("income").map(option);
  const cashAccounts = listAssets().filter((a) => a.type === "cash").map(option);

  return (
    <>
      {due.length > 0 ? <DueReview due={due} currency={currency} /> : null}

      {templates.length === 0 ? (
        <p className="text-sm text-stone-700">
          No recurring entries yet. Add rent, salary, loan payments or subscriptions once,
          then post each period from here with one click.
        </p>
      ) : (
        <section>
          <h2 className="text-lg font-semibold">Recurring entries</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-stone-600">
                <tr>
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Repeats</th>
                  <th className="py-2 pr-4 font-medium">Next</th>
                  <th className="py-2 pr-4 font-medium">Cash account</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const next = t.active ? nextOccurrence(t, today) : null;
                  return (
                    <tr key={t.id} className={`border-b border-stone-100 ${t.active ? "" : "text-stone-500"}`}>
                      <td className="py-3 pr-4">
                        <span className="font-medium text-stone-900">{t.note}</span>
                        <span className="block text-xs text-stone-600">
                          {t.kind === "expense" ? "Expense" : "Income"}
                          {t.categoryName ? ` · ${t.categoryName}` : ""}
                          {t.active ? "" : " · Paused"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {t.amountVaries ? "≈ " : ""}
                        {formatMoney(t.amountCents, currency)}
                      </td>
                      <td className="py-3 pr-4">{CADENCE_LABEL[t.cadence]}</td>
                      <td className="py-3 pr-4">
                        {!t.active ? "—" : next ? formatIsoDate(next) : "Ended"}
                      </td>
                      <td className="py-3 pr-4 text-stone-700">{t.assetName ?? "—"}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/activity?tab=recurring&edit=${t.id}`} className={SMALL_BUTTON}>
                            Edit
                          </Link>
                          <form action={toggleTemplateAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="active" value={t.active ? "0" : "1"} />
                            <button type="submit" className={SMALL_BUTTON}>
                              {t.active ? "Pause" : "Resume"}
                            </button>
                          </form>
                          <ConfirmDelete
                            action={deleteTemplateAction}
                            id={t.id}
                            dialogKey={`recurring-${t.id}`}
                            title="Delete this recurring entry?"
                            body="Entries already posted stay in Activity. Nothing new will be posted from this template."
                            triggerLabel="Delete"
                            size="sm"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="max-w-xl border-t border-stone-200 pt-6">
        <h2 className="text-lg font-semibold">
          {editing ? "Edit recurring entry" : "Add recurring entry"}
        </h2>
        <div className="mt-4">
          <RecurringForm
            key={editing?.id ?? "new"}
            action={editing ? updateTemplateAction : createTemplateAction}
            idPrefix={editing ? `recurring-${editing.id}` : "recurring-new"}
            submitLabel={editing ? "Save recurring entry" : "Add recurring entry"}
            templateId={editing?.id}
            cancelHref={editing ? "/activity?tab=recurring" : undefined}
            expenseCategories={expenseCategories}
            incomeCategories={incomeCategories}
            cashAccounts={cashAccounts}
            defaults={
              editing
                ? {
                    kind: editing.kind,
                    amount: centsToDecimalInput(editing.amountCents),
                    amountVaries: editing.amountVaries,
                    cadence: editing.cadence,
                    anchorOn: editing.anchorOn,
                    endOn: editing.endOn ?? "",
                    categoryId: editing.categoryId,
                    assetId: editing.assetId,
                    note: editing.note ?? "",
                  }
                : {
                    kind: "expense",
                    amount: "",
                    amountVaries: false,
                    cadence: "monthly",
                    anchorOn: today,
                    endOn: "",
                    categoryId: null,
                    assetId: null,
                    note: "",
                  }
            }
          />
          {editing ? (
            <p className="mt-3 text-xs text-stone-600">
              Changes apply to entries posted from now on. Entries already posted are not changed.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}

function DueReview({ due, currency }: { due: DueItem[]; currency: string }) {
  const firstVarying = due.find((d) => d.amountVaries);
  return (
    <section aria-labelledby="due-heading" className="rounded-lg border border-teal-200 bg-teal-50/40 p-4">
      <h2 id="due-heading" className="text-lg font-semibold">
        Due to post
      </h2>
      <p className="mt-1 text-sm text-stone-700">
        Check the amounts, untick anything that didn&apos;t happen, then post. Posting the same
        period twice never creates a second entry.
      </p>
      <form action={postDueAction} className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-600">
              <tr>
                <th className="py-2 pr-3 font-medium">Post</th>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pr-4 font-medium">Amount ({currency})</th>
                <th className="py-2 font-medium">Cash account</th>
              </tr>
            </thead>
            <tbody>
              {due.map((d) => {
                const key = `${d.templateId}:${d.period}`;
                const checkboxId = `post-${key}`;
                return (
                  <tr key={key} className="border-b border-stone-100">
                    <td className="py-2 pr-3">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        name="post"
                        value={key}
                        defaultChecked
                        className="accent-teal-800"
                      />
                    </td>
                    <td className="py-2 pr-4">{formatIsoDate(d.occurredOn)}</td>
                    <td className="py-2 pr-4">
                      <label htmlFor={checkboxId} className="font-medium text-stone-900">
                        {d.note}
                      </label>
                      <span className="block text-xs text-stone-600">
                        {d.kind === "expense" ? "Expense" : "Income"}
                        {d.categoryName ? ` · ${d.categoryName}` : ""}
                        {d.amountVaries ? " · amount varies" : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        name={`amount:${key}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`Amount for ${d.note ?? "entry"} on ${formatIsoDate(d.occurredOn)}`}
                        defaultValue={centsToDecimalInput(d.amountCents)}
                        autoFocus={d === firstVarying}
                        className="w-28 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm tabular-nums text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                      />
                    </td>
                    <td className="py-2 text-stone-700">{d.assetName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <SubmitButton>Post selected</SubmitButton>
        </div>
      </form>
    </section>
  );
}
