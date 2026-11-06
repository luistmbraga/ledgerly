import { MoneyInput } from "@/components/money-input";
import type { InvoiceStatus } from "@/db/repositories/invoices";

type InvoiceFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  invoiceStatus?: InvoiceStatus;
  defaultDueOn: string;
};

export function InvoiceForm({
  action,
  invoiceStatus,
  defaultDueOn,
}: InvoiceFormProps) {
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      {invoiceStatus ? (
        <input type="hidden" name="invoiceStatus" value={invoiceStatus} />
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="invoice-direction" className="text-sm font-medium text-stone-800">
          Direction
        </label>
        <select
          id="invoice-direction"
          name="direction"
          required
          defaultValue="payable"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        >
          <option value="payable">Payable</option>
          <option value="receivable">Receivable</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="invoice-counterparty" className="text-sm font-medium text-stone-800">
          Counterparty
        </label>
        <input
          id="invoice-counterparty"
          name="counterparty"
          type="text"
          maxLength={200}
          autoComplete="off"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="invoice-due" className="text-sm font-medium text-stone-800">
          Due date
        </label>
        <input
          id="invoice-due"
          name="dueOn"
          type="date"
          defaultValue={defaultDueOn}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        />
      </div>
      <MoneyInput id="invoice-amount" name="amount" label="Amount" />
      <div className="flex flex-col gap-1">
        <label htmlFor="invoice-note" className="text-sm font-medium text-stone-800">
          Note
        </label>
        <input
          id="invoice-note"
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
        Add invoice
      </button>
    </form>
  );
}
