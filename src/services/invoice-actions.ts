"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancel,
  createInvoice,
  isInvoiceDirection,
  isInvoiceStatus,
  markPaid,
  type InvoiceStatus,
} from "@/db/repositories/invoices";
import { isValidIsoDate } from "@/db/repositories/snapshots";
import { parseMoneyToCents } from "@/lib/money";

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function activityPath(extra?: Record<string, string | undefined>): string {
  const params = new URLSearchParams({ tab: "invoices" });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  return `/activity?${params.toString()}`;
}

function fail(message: string, invoiceStatus?: string): never {
  redirect(activityPath({ error: message, invoiceStatus }));
}

function readId(formData: FormData): number | null {
  const raw = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function readFilter(formData: FormData): InvoiceStatus | undefined {
  const value = String(formData.get("invoiceStatus") ?? "");
  return isInvoiceStatus(value) ? value : undefined;
}

function filterParam(status: InvoiceStatus | undefined): string | undefined {
  return status;
}

export async function createInvoiceAction(formData: FormData) {
  const invoiceStatus = readFilter(formData);
  const direction = String(formData.get("direction") ?? "");
  if (!isInvoiceDirection(direction)) {
    fail("Choose receivable or payable.", filterParam(invoiceStatus));
  }
  const parsed = parseMoneyToCents(String(formData.get("amount") ?? ""));
  if (!parsed.ok) fail(parsed.error, filterParam(invoiceStatus));
  if (parsed.cents <= 0) {
    fail("Enter an amount greater than zero.", filterParam(invoiceStatus));
  }
  const dueRaw = String(formData.get("dueOn") ?? "").trim();
  if (dueRaw !== "" && !isValidIsoDate(dueRaw)) {
    fail("Enter a valid due date.", filterParam(invoiceStatus));
  }
  const counterparty = String(formData.get("counterparty") ?? "").trim();
  if (counterparty.length > 200) {
    fail("Counterparty must be 200 characters or fewer.", filterParam(invoiceStatus));
  }
  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 500) {
    fail("Note must be 500 characters or fewer.", filterParam(invoiceStatus));
  }

  try {
    createInvoice({
      direction,
      amountCents: parsed.cents,
      dueOn: dueRaw === "" ? null : dueRaw,
      counterparty: counterparty === "" ? null : counterparty,
      note: note === "" ? null : note,
    });
  } catch (error) {
    fail(
      error instanceof Error ? error.message : "Could not save the invoice.",
      filterParam(invoiceStatus),
    );
  }

  revalidatePath("/activity");
  redirect(
    activityPath({
      saved: "invoice-created",
      invoiceStatus: filterParam(invoiceStatus),
    }),
  );
}

export async function markInvoicePaidAction(formData: FormData) {
  const invoiceStatus = readFilter(formData);
  const id = readId(formData);
  if (id === null) fail("Invoice not found.", filterParam(invoiceStatus));
  const paidOn = todayIso();
  try {
    markPaid(id, paidOn);
  } catch (error) {
    fail(
      error instanceof Error ? error.message : "Could not mark the invoice paid.",
      filterParam(invoiceStatus),
    );
  }
  revalidatePath("/activity");
  redirect(
    activityPath({
      saved: "invoice-paid",
      invoiceStatus: filterParam(invoiceStatus),
    }),
  );
}

export async function cancelInvoiceAction(formData: FormData) {
  const invoiceStatus = readFilter(formData);
  const id = readId(formData);
  if (id === null) fail("Invoice not found.", filterParam(invoiceStatus));
  try {
    cancel(id);
  } catch (error) {
    fail(
      error instanceof Error ? error.message : "Could not cancel the invoice.",
      filterParam(invoiceStatus),
    );
  }
  revalidatePath("/activity");
  redirect(
    activityPath({
      saved: "invoice-cancelled",
      invoiceStatus: filterParam(invoiceStatus),
    }),
  );
}
