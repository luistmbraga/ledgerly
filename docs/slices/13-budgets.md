# Slice 13 — Budgets per category

## Goal

Let users set a monthly budget on expense categories and see month-to-date consumption at a glance. Two new findings alert when a category approaches or exceeds its budget.

## In scope

- Add `budget_monthly_cents` (nullable integer) to the `categories` table (expense categories only; income categories ignore it).
- `computeBudgetStatus(categoryId, name, budgetCents, spentCents)` pure domain function returning `{ status: "ok" | "warning" | "over", consumptionRatio, remainingCents, … }`.
- `getMtdSpendByCategoryId(yearMonth)` repository query summing expenses by category for the given month.
- Two findings detectors in `buildFindings`: `overspend_budget` (status `"over"`, severity `"warn"`) and `budget_warning` (status `"warning"`, severity `"info"`).
- Budget field in the category update form (Activity → Expenses → categories panel); MTD progress bar shown per budgeted expense category.
- Budget findings wired into `buildFinancialSnapshot` via `FinancialSnapshotInput.budgetStatuses`.

## Out of scope

- Income budgets.
- Annual or rolling budgets.
- Budget rollover / carry-forward.
- Budget charts or history.
- Automatic budget suggestions.

## Acceptance

- An expense category with a budget shows MTD consumption and remaining amount.
- Entering a budget of €300 and spending €250 MTD shows "warning" (≥ 80%).
- Spending €310 shows "over"; the `overspend_budget` finding fires on the dashboard.
- Zero categories have budgets → no new finding fires, all existing tests still pass.
- Clearing the budget field (empty submit) removes the budget.
