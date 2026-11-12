# Slice 23 — Goal budget check

## Goal

Answer "what can I afford by this date?" for goals where the amount is unknown (a vacation, a car). The user picks a date; code returns a spending ceiling from money they can spare, without touching the emergency fund or what existing goals need.

## In scope

- `src/domain/goal-budget.ts`: `computeBudgetCeiling` per [domain.md](../domain.md#goal-budget-ceiling-slice-23), three tiers (Comfortable 50%, Balanced 80%, Stretch 100% of both spare cash and free monthly surplus). Unit tests in `goal-budget.test.ts`.
- `loadGoalsWithBudgetCheck` in `src/app/goals/load.ts` (one emergency-fund read per request; `loadGoals` accepts an optional fund view).
- "Budget check" section on `/goals` (GET form, tier cards, assumptions list, empty and error states).
- "Use as goal" prefills the existing add form via query params; the user confirms by saving.
- `docs/domain.md`, `docs/ux.md` updated.

## Out of scope

- Loans or financing for big purchases.
- Expected return on the saving; manual monthly amount override.
- Changes to goal statuses, `allocateCapacity`, findings, briefing, or the dashboard.
- AI narration of the result. No schema change.

## Acceptance

- [x] With no goals, Stretch = spare cash + average surplus × months.
- [x] Existing goals reduce the free monthly amount by their planned (or required) monthly; overdue and funded goals reserve nothing monthly.
- [x] Spare cash excludes the emergency fund target and every goal's set-aside; never negative.
- [x] Each tier uses its share of spare cash; Stretch uses all of it.
- [x] Negative surplus or no surplus history → ceiling is the tier's share of spare cash.
- [x] A tier saved as a goal is "On track".
- [x] A past date shows an inline error and no result.
