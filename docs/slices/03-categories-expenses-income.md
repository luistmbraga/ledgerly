# Slice 03 — Categories, expenses, income

## Goal

Seed categories; user can log expenses and income on Activity page with categorization.

## Depends on

Slice 01 (slice 02 recommended for dashboard surplus later, not blocking).

## Domain rules

- Category kinds and essential flag [data-model.md](../data-model.md)
- Cashflow sums [domain.md](../domain.md) (implement `sumCashflow(range)` for later slices)

## In scope

### Database

- Tables: `categories`, `expenses`, `incomes`
- Seed default categories from data-model doc on migrate

### Repositories + actions

- List/create/update/delete categories (block delete if entries reference)
- CRUD expenses and incomes with date, amount, optional category, note

### UI

- `/activity` with tabs Expenses and Income (Invoices tab placeholder label "Coming in slice 04" or disabled)
- Forms and tables per [ux.md](../ux.md)
- Show uncategorized expenses visually

### Domain tests

- Cashflow aggregation for a fixed date range fixture

## Files allowed

```
src/db/schema.ts, migration, seed categories
src/domain/cashflow.ts, cashflow.test.ts
src/db/repositories/categories.ts, expenses.ts, incomes.ts
src/app/activity/page.tsx, components for tabs/tables
```

## Out of scope

- AI category suggest
- Invoices
- Updating asset balances from income/expense

## Acceptance checks

- [x] Default categories exist after migrate
- [x] Add expense with category; appears in list
- [x] Edit category essential flag affects repository data
- [x] Cannot delete category with expenses attached
- [x] Cashflow unit test passes
