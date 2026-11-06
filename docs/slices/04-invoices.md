# Slice 04 — Invoices

## Goal

Track receivable and payable invoices; mark paid creates linked income or expense.

## Depends on

Slice 03.

## Domain rules

- Invoice statuses and directions [product.md](../product.md)
- Table `invoices` [data-model.md](../data-model.md)

## In scope

### Repository

- CRUD invoices
- `markPaid(id, paidOnDate)`:
  - Sets status `paid`, `paid_at`
  - Creates income if receivable or expense if payable (amount from invoice, date = paid date, note references invoice)
  - Stores `linked_income_id` or `linked_expense_id`
- `cancel(id)` → status cancelled, no journal entry

### UI

- Activity tab Invoices: list, add, mark paid, cancel
- Confirm dialog on mark paid per ux copy

### Idempotency

- Second mark paid on same invoice rejected

## Files allowed

```
src/db/schema.ts, migration
src/db/repositories/invoices.ts
src/app/activity/* (invoices tab)
src/services/invoice-actions.ts
```

## Out of scope

- Recurring invoices
- Partial payments
- Auto-create receivable **asset** type

## Acceptance checks

- [x] Create payable invoice, mark paid → expense appears in Activity
- [x] Create receivable, mark paid → income appears
- [x] Cancelled invoice cannot be marked paid
- [x] Open invoices filterable in UI
