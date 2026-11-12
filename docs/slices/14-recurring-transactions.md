# Slice 14 — Recurring transactions

## Goal

Let users define predictable expenses and incomes once (rent, loan instalments, salary, subscriptions, utilities) and post each period's entry with one explicit review step. Posting is idempotent: running it twice never creates a second row for the same period.

## In scope

- New `recurring_templates` table: `kind` (expense | income), `amount_cents` (> 0, expected amount), `amount_varies` (bool), `match_text` (nullable; reserved for import dedupe in slice 15), `category_id` (FK set null, kind must match), `asset_id` (FK set null), `link_cash` (bool), `note`, `cadence` (monthly | yearly | weekly), `anchor_on` (first occurrence, ISO date), `end_on` (nullable), `active`, timestamps.
- Add `recurring_template_id` (FK set null) and `recurring_period` (text, e.g. `2026-11`, `2026`, `2026-W45`) to `expenses` and `incomes`, with a UNIQUE index on `(recurring_template_id, recurring_period)` so the database enforces once-per-period.
- Pure `duePeriods(template, postedPeriods, asOfDate)` in `src/domain/recurring.ts`:
  - Monthly occurrences clamp to month end (`addMonths` from `src/lib/dates.ts`): anchored on the 31st → Feb 28/29, Apr 30.
  - Yearly clamps Feb 29 → Feb 28 in non-leap years.
  - Weekly steps 7 days.
  - Returns only occurrences on or before `asOfDate`, not yet posted, within `end_on`; inactive templates return none.
  - Catch-up capped at 24 occurrences per template.
- Repository `src/db/repositories/recurring.ts`: list/create/update/delete/setActive templates; `listDue(asOfDate)`; `postDue(asOfDate, items[])` where each item is `{templateId, period, amountCents}`.
  - One transaction; inserts in ascending date order through the existing expense/income create path (validation + cash link).
  - When `link_cash` is on and the date is before the account's latest balance, the row posts unlinked and the result reports it per row.
  - A period already posted (unique index) is skipped, not an error.
- Activity page "Recurring" section: template list with add / edit / pause-resume / delete (shared `ConfirmDelete`), forms via `useActionState`.
- "N recurring entries due" banner on Activity → review list with a checkbox and an editable amount per item (prefilled from the template; focused first when `amount_varies`) → Post selected.
- Deleting a template keeps its posted rows (FK set null).
- Include `recurring_templates` and the new journal columns in the JSON backup export/import (slice 12).

## Out of scope

- Automatic posting (on page load, on a schedule, or in the background).
- Proration, partial periods, or custom intervals (every N months, specific weekdays).
- Suggesting templates from existing journal or imported history.
- Using `match_text` for anything (slice 15 consumes it).
- Editing past posted rows when a template changes (template edits affect future posts only).

## Acceptance

- Posting the same due period twice yields exactly one row; a direct duplicate insert is rejected by the unique index.
- A monthly template anchored on 2026-01-31 is due on 2026-02-28, 2026-03-31, 2026-04-30.
- A paused template shows nothing due; resuming it shows the missed periods (up to the 24 cap).
- A template with `end_on` stops producing periods after that date.
- Editing the amount in the review list posts the edited amount; the template amount is unchanged.
- With `link_cash` on, a due row dated before the cash account's latest snapshot posts unlinked and the UI says so.
- Deleting a template leaves its posted expenses/incomes intact with `recurring_template_id` null.
- Backup export → import round-trips templates and posted-row links.
- `pnpm typecheck && pnpm lint && pnpm test` pass.
