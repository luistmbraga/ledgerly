import Link from "next/link";
import { todayUtc } from "@/lib/dates";
import { listAssets } from "@/db/repositories/assets";
import { listCategories } from "@/db/repositories/categories";
import { listExpenses } from "@/db/repositories/expenses";
import { listIncomes } from "@/db/repositories/incomes";
import { centsToDecimalInput, formatMoney } from "@/lib/money";
import { getDisplayCurrency } from "@/services/dashboard-summary";
import { formatIsoDate } from "../assets/labels";
import {
  createExpenseAction,
  createIncomeAction,
  deleteExpenseAction,
  deleteIncomeAction,
  updateExpenseAction,
  updateIncomeAction,
} from "./actions";
import { CategoryPanel } from "./category-panel";
import { ConfirmDelete } from "./confirm-delete";
import { JournalForm } from "./journal-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TABS = [
  { id: "expenses", label: "Expenses" },
  { id: "income", label: "Income" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const SAVED: Record<string, string> = {
  "expense-created": "Expense added.",
  "expense-updated": "Expense updated.",
  "expense-deleted": "Expense deleted.",
  "income-created": "Income added.",
  "income-updated": "Income updated.",
  "income-deleted": "Income deleted.",
  "category-created": "Category added.",
  "category-updated": "Category updated.",
  "category-deleted": "Category deleted.",
};

function parseTab(value: string | undefined): Tab {
  if (value === "income") return value;
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
  }>;
}) {
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const editId = parseEditId(params.edit);
  const currency = getDisplayCurrency();
  const saved = params.saved ? SAVED[params.saved] : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-stone-600">
          Log expenses and income. Optionally link a cash account to update that
          balance with a snapshot.
        </p>
      </header>

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
      </div>
    </div>
  );
}

function cashAccountOptions() {
  return listAssets()
    .filter((asset) => asset.type === "cash")
    .map((asset) => ({ id: asset.id, name: asset.name }));
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

      <CategoryPanel kind="expense" categories={categories} />
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
              {rows.map((row) => (
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
                      />
                    </div>
                  </td>
                </tr>
              ))}
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

function Flash({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {message ? (
        <p
          role="status"
          className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
