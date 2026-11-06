"use client";

import { useRef } from "react";
import type { InvoiceStatus } from "@/db/repositories/invoices";

const MARK_PAID_COPY =
  "This will record an income/expense entry for today. You can edit the date in Activity.";

type InvoiceDialogProps = {
  action: (formData: FormData) => void | Promise<void>;
  id: number;
  invoiceStatus?: InvoiceStatus;
};

export function MarkPaidButton({ action, id, invoiceStatus }: InvoiceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `mark-paid-title-${id}`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
      >
        Mark paid
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(100%,24rem)] rounded-md border border-stone-200 p-0 text-stone-900 backdrop:bg-stone-900/40"
      >
        <div className="flex flex-col gap-4 p-4">
          <h2 id={titleId} className="text-lg font-semibold">
            Mark this invoice paid?
          </h2>
          <p className="text-sm text-stone-700">{MARK_PAID_COPY}</p>
          <div className="flex gap-2">
            <form action={action}>
              <input type="hidden" name="id" value={id} />
              {invoiceStatus ? (
                <input type="hidden" name="invoiceStatus" value={invoiceStatus} />
              ) : null}
              <button
                type="submit"
                className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
              >
                Mark paid
              </button>
            </form>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function CancelInvoiceButton({
  action,
  id,
  invoiceStatus,
}: InvoiceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `cancel-invoice-title-${id}`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
      >
        Cancel
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(100%,24rem)] rounded-md border border-stone-200 p-0 text-stone-900 backdrop:bg-stone-900/40"
      >
        <div className="flex flex-col gap-4 p-4">
          <h2 id={titleId} className="text-lg font-semibold">
            Cancel this invoice?
          </h2>
          <p className="text-sm text-stone-700">
            The invoice will be marked cancelled. No income or expense will be
            recorded.
          </p>
          <div className="flex gap-2">
            <form action={action}>
              <input type="hidden" name="id" value={id} />
              {invoiceStatus ? (
                <input type="hidden" name="invoiceStatus" value={invoiceStatus} />
              ) : null}
              <button
                type="submit"
                className="rounded-md bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
              >
                Cancel invoice
              </button>
            </form>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Keep invoice
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
