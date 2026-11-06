import { desc, eq } from "drizzle-orm";
import { isValidIsoDate } from "./snapshots";
import { db } from "../client";
import { expenses, incomes, invoices, type InvoiceRow } from "../schema";

export const INVOICE_DIRECTIONS = ["receivable", "payable"] as const;
export const INVOICE_STATUSES = ["open", "paid", "cancelled"] as const;

export type InvoiceDirection = (typeof INVOICE_DIRECTIONS)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type InvoiceRecord = InvoiceRow;

export type InvoiceInput = {
  direction: InvoiceDirection;
  amountCents: number;
  dueOn: string | null;
  counterparty: string | null;
  note: string | null;
};

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

export function isInvoiceDirection(value: string): value is InvoiceDirection {
  return (INVOICE_DIRECTIONS as readonly string[]).includes(value);
}

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(value);
}

function assertInvoiceInput(input: InvoiceInput): InvoiceInput {
  if (!isInvoiceDirection(input.direction)) {
    invalid("Choose receivable or payable.");
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    invalid("Enter an amount greater than zero.");
  }
  if (input.dueOn !== null && !isValidIsoDate(input.dueOn)) {
    invalid("Enter a valid due date.");
  }
  if (input.counterparty !== null && input.counterparty.length > 200) {
    invalid("Counterparty must be 200 characters or fewer.");
  }
  if (input.note !== null && input.note.length > 500) {
    invalid("Note must be 500 characters or fewer.");
  }
  return input;
}

function journalNote(invoice: InvoiceRecord): string {
  const who = invoice.counterparty ? ` (${invoice.counterparty})` : "";
  const note = `Invoice #${invoice.id}${who}`;
  return note.length > 500 ? note.slice(0, 500) : note;
}

export function listInvoices(status?: InvoiceStatus): InvoiceRecord[] {
  const query = db.select().from(invoices).orderBy(desc(invoices.id));
  if (!status) return query.all();
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.status, status))
    .orderBy(desc(invoices.id))
    .all();
}

export function getInvoice(id: number): InvoiceRecord | undefined {
  return db.select().from(invoices).where(eq(invoices.id, id)).get();
}

export function createInvoice(input: InvoiceInput): InvoiceRecord {
  const value = assertInvoiceInput(input);
  const now = new Date().toISOString();
  return db
    .insert(invoices)
    .values({
      direction: value.direction,
      amountCents: value.amountCents,
      dueOn: value.dueOn,
      status: "open",
      counterparty: value.counterparty,
      note: value.note,
      paidAt: null,
      linkedIncomeId: null,
      linkedExpenseId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export function updateInvoice(
  id: number,
  input: InvoiceInput,
): InvoiceRecord | undefined {
  const existing = getInvoice(id);
  if (!existing) return undefined;
  if (existing.status !== "open") {
    invalid("Only open invoices can be edited.");
  }
  const value = assertInvoiceInput(input);
  return db
    .update(invoices)
    .set({
      direction: value.direction,
      amountCents: value.amountCents,
      dueOn: value.dueOn,
      counterparty: value.counterparty,
      note: value.note,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(invoices.id, id))
    .returning()
    .get();
}

export function deleteInvoice(id: number): boolean {
  const existing = getInvoice(id);
  if (!existing) return false;
  if (existing.status === "paid") {
    invalid("Paid invoices cannot be deleted.");
  }
  db.delete(invoices).where(eq(invoices.id, id)).run();
  return true;
}

export function markPaid(id: number, paidOnDate: string): InvoiceRecord {
  if (!isValidIsoDate(paidOnDate)) {
    invalid("Enter a valid date.");
  }

  return db.transaction((tx) => {
    const invoice = tx.select().from(invoices).where(eq(invoices.id, id)).get();
    if (!invoice) invalid("Invoice not found.");
    if (invoice.status === "paid") {
      invalid("This invoice is already paid.");
    }
    if (invoice.status === "cancelled") {
      invalid("Cancelled invoices cannot be marked paid.");
    }
    if (invoice.status !== "open") {
      invalid("Only open invoices can be marked paid.");
    }

    const now = new Date().toISOString();
    const note = journalNote(invoice);
    let linkedIncomeId: number | null = null;
    let linkedExpenseId: number | null = null;

    if (invoice.direction === "receivable") {
      const income = tx
        .insert(incomes)
        .values({
          amountCents: invoice.amountCents,
          occurredOn: paidOnDate,
          categoryId: null,
          note,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      linkedIncomeId = income.id;
    } else {
      const expense = tx
        .insert(expenses)
        .values({
          amountCents: invoice.amountCents,
          occurredOn: paidOnDate,
          categoryId: null,
          note,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      linkedExpenseId = expense.id;
    }

    const updated = tx
      .update(invoices)
      .set({
        status: "paid",
        paidAt: now,
        linkedIncomeId,
        linkedExpenseId,
        updatedAt: now,
      })
      .where(eq(invoices.id, id))
      .returning()
      .get();

    if (!updated?.paidAt || updated.status !== "paid") {
      invalid("Invoice could not be marked paid.");
    }
    return updated;
  });
}

export function cancel(id: number): InvoiceRecord {
  return db.transaction((tx) => {
    const invoice = tx.select().from(invoices).where(eq(invoices.id, id)).get();
    if (!invoice) invalid("Invoice not found.");
    if (invoice.status === "cancelled") {
      invalid("This invoice is already cancelled.");
    }
    if (invoice.status === "paid") {
      invalid("Paid invoices cannot be cancelled.");
    }

    const updated = tx
      .update(invoices)
      .set({
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(invoices.id, id))
      .returning()
      .get();

    if (!updated) invalid("Invoice not found.");
    return updated;
  });
}
