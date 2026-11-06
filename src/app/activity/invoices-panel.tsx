import { listInvoices, type InvoiceStatus } from "@/db/repositories/invoices";
import { formatMoney } from "@/lib/money";
import {
  cancelInvoiceAction,
  createInvoiceAction,
  markInvoicePaidAction,
} from "@/services/invoice-actions";
import { formatIsoDate } from "../assets/labels";
import { CancelInvoiceButton, MarkPaidButton } from "./invoice-dialogs";
import { InvoiceForm } from "./invoice-form";

const FILTERS: { id: "all" | InvoiceStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "paid", label: "Paid" },
  { id: "cancelled", label: "Cancelled" },
];

const DIRECTION_LABELS = {
  receivable: "Receivable",
  payable: "Payable",
} as const;

const STATUS_LABELS = {
  open: "Open",
  paid: "Paid",
  cancelled: "Cancelled",
} as const;

export function InvoicesPanel({
  currency,
  status,
}: {
  currency: string;
  status?: InvoiceStatus;
}) {
  const rows = listInvoices(status);
  const emptyAll = rows.length === 0 && status === undefined;

  return (
    <>
      <nav aria-label="Invoice status" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = filter.id === "all" ? status === undefined : status === filter.id;
          const href =
            filter.id === "all"
              ? "/activity?tab=invoices"
              : `/activity?tab=invoices&invoiceStatus=${filter.id}`;
          return (
            <a
              key={filter.id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 ${
                active
                  ? "border-teal-800 bg-teal-50 text-teal-900"
                  : "border-stone-300 text-stone-700 hover:bg-stone-100"
              }`}
            >
              {filter.label}
            </a>
          );
        })}
      </nav>

      {emptyAll ? (
        <p className="text-sm text-stone-700">
          No invoices yet. Add a payable or receivable to track money you owe
          or expect to receive.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-700">
          No {STATUS_LABELS[status ?? "open"].toLowerCase()} invoices.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Direction</th>
                <th className="py-2 pr-4 font-medium">Counterparty</th>
                <th className="py-2 pr-4 font-medium">Due date</th>
                <th className="py-2 pr-4 font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-stone-100">
                  <td className="py-3 pr-4 text-stone-800">
                    {DIRECTION_LABELS[row.direction as keyof typeof DIRECTION_LABELS] ??
                      row.direction}
                  </td>
                  <td className="py-3 pr-4 text-stone-700">
                    {row.counterparty ?? "—"}
                  </td>
                  <td className="py-3 pr-4">
                    {row.dueOn ? formatIsoDate(row.dueOn) : "—"}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {formatMoney(row.amountCents, currency)}
                  </td>
                  <td className="py-3 pr-4">
                    {STATUS_LABELS[row.status as keyof typeof STATUS_LABELS] ?? row.status}
                  </td>
                  <td className="py-3">
                    {row.status === "open" ? (
                      <div className="flex flex-wrap gap-2">
                        <MarkPaidButton
                          action={markInvoicePaidAction}
                          id={row.id}
                          invoiceStatus={status}
                        />
                        <CancelInvoiceButton
                          action={cancelInvoiceAction}
                          id={row.id}
                          invoiceStatus={status}
                        />
                      </div>
                    ) : (
                      <span className="text-stone-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="max-w-xl border-t border-stone-200 pt-6">
        <h2 className="text-lg font-semibold">
          {emptyAll ? "Add your first invoice" : "Add invoice"}
        </h2>
        <div className="mt-4">
          <InvoiceForm
            action={createInvoiceAction}
            invoiceStatus={status}
            defaultDueOn=""
          />
        </div>
      </section>
    </>
  );
}
