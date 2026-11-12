import Link from "next/link";
import { todayUtc } from "@/lib/dates";
import { listAssets } from "@/db/repositories/assets";
import { listCategories } from "@/db/repositories/categories";
import { listExpenses, getMtdSpendByCategoryId, type ExpenseWithCategory } from "@/db/repositories/expenses";
import { listIncomes } from "@/db/repositories/incomes";
import { listDue } from "@/db/repositories/recurring";
import { listSnapshotsForAsset } from "@/db/repositories/snapshots";
import { selectLatestSnapshot } from "@/domain/net-worth";
import { centsToDecimalInput, formatMoney } from "@/lib/money";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import { formatIsoDate } from "../assets/labels";
import {
  createExpenseAction,
  createIncomeAction,
  deleteExpenseAction,
  deleteIncomeAction,
  unlinkExpenseCashAction,
  unlinkIncomeCashAction,
  updateExpenseAction,
  updateIncomeAction,
} from "./actions";
import { CategoryPanel } from "./category-panel";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Flash } from "@/components/flash";
import { JournalForm } from "./journal-form";
import { QuickEntry } from "./quick-entry";
import { RecurringTab } from "./recurring-tab";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TABS = [
  { id: "expenses", label: "Expenses" },
  { id: "income", label: "Income" },
  { id: "recurring", label: "Recurring" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const SAVED: Record<string, string> = {
  "expense-created": "Expense added.",
  "expense-updated": "Expense updated.",
  "expense-deleted": "Expense deleted.",
  "expense-unlinked": "Cash link removed. The expense is now editable.",
  "income-created": "Income added.",
  "income-updated": "Income updated.",
  "income-deleted": "Income deleted.",
  "income-unlinked": "Cash link removed. The income is now editable.",
  "category-created": "Category added.",
  "category-updated": "Category updated.",
  "category-deleted": "Category deleted.",
  "recurring-created": "Recurring entry added.",
  "recurring-updated": "Recurring entry updated.",
  "recurring-deleted": "Recurring entry deleted. Entries already posted were kept.",
  "recurring-paused": "Recurring entry paused.",
  "recurring-resumed": "Recurring entry resumed.",
};

function countParam(value: string | undefined): number {
  return value && /^\d{1,4}$/.test(value) ? Number(value) : 0;
}

function postedMessage(posted: number, unlinked: number): string {
  if (posted === 0) return "Nothing new to post. Those periods were already posted.";
  const base = posted === 1 ? "1 recurring entry posted." : `${posted} recurring entries posted.`;
  if (unlinked === 0) return base;
  const which = unlinked === 1 ? "1 was" : `${unlinked} were`;
  return `${base} ${which} posted without the cash link because the account already has a newer balance.`;
}

function parseTab(value: string | undefined): Tab {
  if (value === "income" || value === "recurring") return value;
  return "expenses";
}

function parseEditId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}


export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    error?: string;
    saved?: string;
    edit?: string;
    posted?: string;
    unlinked?: string;
  }>;
}) {
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const editId = parseEditId(params.edit);
  const currency = getDisplayCurrency();
  const today = todayUtc();
  const due = listDue(today);
  const saved =
    params.saved === "recurring-posted"
      ? postedMessage(countParam(params.posted), countParam(params.unlinked))
      : params.saved === "recurring-suggested"
        ? `${countParam(params.posted)} recurring ${countParam(params.posted) === 1 ? "entry" : "entries"} created from your history.`
      : params.saved
        ? SAVED[params.saved]
        : undefined;
  const hasCategories = listCategories("expense").length > 0 || listCategories("income").length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <Link
            href="/activity/import"
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
          >
            Import statement
          </Link>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Log expenses and income. Optionally link a cash account to update that
          balance with a snapshot.
        </p>
      </header>

      <div className="mt-6">
        <QuickEntry currency={currency} hasCategories={hasCategories} />
      </div>

      {due.length > 0 && tab !== "recurring" ? (
        <p
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
        >
          <span>
            {due.length === 1
              ? "1 recurring entry is due."
              : `${due.length} recurring entries are due.`}
          </span>
          <Link
            href="/activity?tab=recurring"
            className="font-medium underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          >
            Review and post
          </Link>
        </p>
      ) : null}

      <nav aria-label="Activity" className="mt-4 flex gap-2 border-b border-stone-200">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <Link
              key={item.id}
              href={`/activity?tab=${item.id}`}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
                active
                  ? "border-teal-800 font-medium text-teal-900"
                  : "border-transparent text-stone-600 hover:text-stone-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 flex flex-col gap-8">
        <Flash error={params.error} message={saved} />
        {tab === "expenses" ? (
          <ExpenseTab currency={currency} editId={editId} />
        ) : null}
        {tab === "income" ? (
          <IncomeTab currency={currency} editId={editId} />
        ) : null}
        {tab === "recurring" ? (
          <RecurringTab currency={currency} editId={editId} today={today} due={due} />
        ) : null}
      </div>
    </div>
  );
}

function cashAccountOptions() {
  return listAssets()
    .filter((asset) => asset.type === "cash")
    .map((asset) => ({ id: asset.id, name: asset.name }));
}

type LinkedRow = { id: number; assetId: number | null; linkedSnapshotId: number | null };

function buildFrozenSet(rows: LinkedRow[]): Set<number> {
  const assetIds = [
    ...new Set(
      rows
        .filter((r) => r.linkedSnapshotId !== null && r.assetId !== null)
        .map((r) => r.assetId!),
    ),
  ];
  const latestByAsset = new Map<number, number | null>();
  for (const assetId of assetIds) {
    const snaps = listSnapshotsForAsset(assetId);
    const latest = selectLatestSnapshot(snaps);
    latestByAsset.set(assetId, latest?.id ?? null);
  }
  const frozen = new Set<number>();
  for (const row of rows) {
    if (row.linkedSnapshotId !== null && row.assetId !== null) {
      const latestId = latestByAsset.get(row.assetId);
      if (latestId !== row.linkedSnapshotId) {
        frozen.add(row.id);
      }
    }
  }
  return frozen;
}

function ExpenseTab({
  currency,
  editId,
}: {
  currency: string;
  editId: number | undefined;
}) {
  const rows = listExpenses();
  const categories = listCategories("expense");
  const cashAccounts = cashAccountOptions();
  const editing = editId === undefined ? undefined : rows.find((row) => row.id === editId);
  const frozen = buildFrozenSet(rows);
  const today = todayUtc();
  const yearMonth = today.substring(0, 7);
  const mtdRows = getMtdSpendByCategoryId(yearMonth);
  const mtdSpend: Record<number, number> = {};
  for (const r of mtdRows) mtdSpend[r.categoryId] = r.totalCents;

  return (
    <>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-700">
          No expenses yet. Add a date, amount, and optional category to start
          the list.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Cash account</th>
                <th className="py-2 pr-4 font-medium">Note</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const uncategorized = row.categoryId === null;
                const isFrozen = frozen.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-stone-100 ${
                      uncategorized ? "bg-amber-50" : ""
                    }`}
                  >
                    <td className="py-3 pr-4">{formatIsoDate(row.occurredOn)}</td>
                    <td
                      className={`py-3 pr-4 ${
                        uncategorized ? "font-medium text-amber-900" : "text-stone-800"
                      }`}
                    >
                      {uncategorized ? "Uncategorized" : row.categoryName}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatMoney(row.amountCents, currency)}
                    </td>
                    <td className="py-3 pr-4 text-stone-700">
                      {row.assetName ?? "—"}
                      {isFrozen ? (
                        <span className="ml-2 text-xs font-medium text-amber-700">
                          Frozen
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-stone-700">{row.note ?? "—"}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/activity?tab=expenses&edit=${row.id}`}
                          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
                        >
                          Edit
                        </Link>
                        {isFrozen ? (
                          <form action={unlinkExpenseCashAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
                            >
                              Unlink
                            </button>
                          </form>
                        ) : null}
                        <ConfirmDelete
                          action={deleteExpenseAction}
                          id={row.id}
                          dialogKey={`expense-${row.id}`}
                          title="Delete this expense?"
                          body={
                            row.assetId === null
                              ? "This removes the expense from Activity. Asset balances stay the same."
                              : "This removes the expense from Activity. If this entry still owns the latest cash snapshot, that balance is reversed."
                          }
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
      )}

      <section className="max-w-xl border-t border-stone-200 pt-6">
        <h2 className="text-lg font-semibold">
          {editing ? "Edit expense" : rows.length === 0 ? "Add your first expense" : "Add expense"}
        </h2>
        <div className="mt-4">
          <JournalForm
            action={editing ? updateExpenseAction : createExpenseAction}
            idPrefix={editing ? `expense-${editing.id}` : "expense-new"}
            submitLabel={editing ? "Save expense" : "Add expense"}
            categories={categories}
            cashAccounts={cashAccounts}
            cancelHref={editing ? "/activity?tab=expenses" : undefined}
            entryId={editing?.id}
            suggestExpenseId={editing?.id ?? null}
            defaults={
              editing
                ? {
                    amount: centsToDecimalInput(editing.amountCents),
                    occurredOn: editing.occurredOn,
                    categoryId: editing.categoryId,
                    assetId: editing.assetId,
                    note: editing.note ?? "",
                  }
                : {
                    amount: "",
                    occurredOn: todayUtc(),
                    categoryId: null,
                    assetId: null,
                    note: "",
                  }
            }
          />
        </div>
      </section>

      <CategoryPanel kind="expense" categories={categories} mtdSpend={mtdSpend} currency={currency} />
    </>
  );
}

function IncomeTab({
  currency,
  editId,
}: {
  currency: string;
  editId: number | undefined;
}) {
  const rows = listIncomes();
  const categories = listCategories("income");
  const cashAccounts = cashAccountOptions();
  const editing = editId === undefined ? undefined : rows.find((row) => row.id === editId);
  const frozen = buildFrozenSet(rows);

  return (
    <>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-700">
          No income yet. Add a date, amount, and optional category to start the
          list.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Cash account</th>
                <th className="py-2 pr-4 font-medium">Note</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isFrozen = frozen.has(row.id);
                return (
                  <tr key={row.id} className="border-b border-stone-100">
                    <td className="py-3 pr-4">{formatIsoDate(row.occurredOn)}</td>
                    <td className="py-3 pr-4 text-stone-800">
                      {row.categoryId === null ? "Uncategorized" : row.categoryName}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatMoney(row.amountCents, currency)}
                    </td>
                    <td className="py-3 pr-4 text-stone-700">
                      {row.assetName ?? "—"}
                      {isFrozen ? (
                        <span className="ml-2 text-xs font-medium text-amber-700">
                          Frozen
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-stone-700">{row.note ?? "—"}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/activity?tab=income&edit=${row.id}`}
                          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
                        >
                          Edit
                        </Link>
                        {isFrozen ? (
                          <form action={unlinkIncomeCashAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
                            >
                              Unlink
                            </button>
                          </form>
                        ) : null}
                        <ConfirmDelete
                          action={deleteIncomeAction}
                          id={row.id}
                          dialogKey={`income-${row.id}`}
                          title="Delete this income?"
                          body={
                            row.assetId === null
                              ? "This removes the income from Activity. Asset balances stay the same."
                              : "This removes the income from Activity. If this entry still owns the latest cash snapshot, that balance is reversed."
                          }
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
      )}

      <section className="max-w-xl border-t border-stone-200 pt-6">
        <h2 className="text-lg font-semibold">
          {editing ? "Edit income" : rows.length === 0 ? "Add your first income" : "Add income"}
        </h2>
        <div className="mt-4">
          <JournalForm
            action={editing ? updateIncomeAction : createIncomeAction}
            idPrefix={editing ? `income-${editing.id}` : "income-new"}
            submitLabel={editing ? "Save income" : "Add income"}
            categories={categories}
            cashAccounts={cashAccounts}
            cancelHref={editing ? "/activity?tab=income" : undefined}
            entryId={editing?.id}
            defaults={
              editing
                ? {
                    amount: centsToDecimalInput(editing.amountCents),
                    occurredOn: editing.occurredOn,
                    categoryId: editing.categoryId,
                    assetId: editing.assetId,
                    note: editing.note ?? "",
                  }
                : {
                    amount: "",
                    occurredOn: todayUtc(),
                    categoryId: null,
                    assetId: null,
                    note: "",
                  }
            }
          />
        </div>
      </section>

      <CategoryPanel kind="income" categories={categories} />
    </>
  );
}

