# Slice 18 — Imports reconcile with recurring entries

## Goal

When a statement is imported after "Post due" has already created an entry, the bank's row should **confirm** that entry rather than duplicate it or leave it stale. This slice closes two gaps in how slice 15's import treats rows that recurring templates (slices 14 and 17) have posted:

1. **Month-end misses.** A template entry posted on Nov 30 and the bank row dated Dec 1 fall in different periods, so today the bank row isn't flagged and imports as a duplicate.
2. **Stale estimates.** When the bank amount differs from the posted one (Endesa posted at 45,00, bank 43,89), the bank row is correctly unticked, but the journal keeps the estimate.

## In scope

### Matching (`src/domain/import-dedupe.ts`)

- The "likely, recurring" rule also matches a template-posted entry **within ±5 days** of the bank row, even when the period differs. The same-period rule stays.
- The other conditions are unchanged:
  - same kind;
  - `match_text` contained in the description, or the amount within ±20% when the template has no `match_text`;
  - each journal row matches at most one bank row.
- When both a same-period entry and a ±5-day entry qualify, the **closest date** wins.

### Bank amount wins (preview)

- A bank row flagged "Recurring" gets a second choice when its amount or value date differs from the matched entry: **"Update the posted entry to €43.89 on Oct 27 (was €45.00 on Oct 25)"**.
  - The choice is **ticked by default**, because the bank is the source of truth.
  - The row's own "Import" checkbox stays unticked.
- If the matched entry is cash-linked and **frozen** (a newer balance exists), the choice is disabled with the reason: "This entry's cash balance was followed by a newer balance; unlink it in Activity to update it."
- **Even when nothing differs**, confirming stores the bank row's fingerprint on the matched entry. That way a re-import of the same statement shows it as **"Already imported"** instead of "Recurring" again. This is silent, and the user doesn't see it as a choice.
- The summary line counts the updates: "… · 3 posted entries will be updated to the bank amount".

### Confirm (`src/db/repositories/imports.ts`)

- The confirm request carries the positions whose update is ticked. Positions only, nothing else.
- The server **re-runs the flags** and accepts an update only for a position that is still flagged "Recurring". The matched entry id comes from that server-side result, never from the browser. Anything else is rejected with "This preview is out of date. Preview the file again."
- **In the same transaction** as the inserts, each update:
  - sets the matched entry's amount, `occurredOn` (the bank's value date) and `import_fingerprint`;
  - goes through the existing cash-link update rules, extracted as transaction-level `updateExpenseTx` / `updateIncomeTx` so `updateExpense` / `updateIncome` keep their behaviour;
  - keeps `recurring_template_id` and `recurring_period` unchanged, so the template doesn't post that period again.
- A frozen linked entry fails the whole import with the row named, matching how slice 15 handles any row error.
- **Rows that match but aren't updated** (nothing differs, or the update was unticked) still get the fingerprint stored, in the same transaction.
- **For undo:** each changed entry is recorded in a new `import_batch_updates` table: `batch_id` (FK cascade), `kind`, `entry_id`, `previous_amount_cents`, `previous_occurred_on`, `previous_fingerprint`.

### Undo

- Undoing a batch also **restores** every entry in `import_batch_updates` to its previous amount, date and fingerprint, through the same cash-link rules, before deleting the batch.
- If a restore would change a frozen cash link, the whole undo is refused, as slice 15 already does for linked rows.
- If an updated entry was deleted since, its record is skipped.

### Other

- **Backup:** export/import includes `import_batch_updates`. Older backups still import.
- **Docs:** `docs/data-model.md` (new table) and `docs/ux.md` (preview update choice).

## Out of scope

- Updating the template itself from bank amounts (e.g. keeping a rolling average). Its amount stays what the user set.
- Linking bank rows to templates that never posted, i.e. creating template entries during an import.
- Changing the category or note of the posted entry from the bank row.
- Any change to how CGD or ActivoBank statements are parsed.

## Acceptance

- **Month-end:** a template entry posted on 2026-11-30 and a bank row on 2026-12-01 with matching description are flagged "Recurring" and unticked. A bank row 6 days away is not flagged.
- **Closest date wins:** with two candidate entries, the one nearest in date is matched.
- **Variable amount:** with Endesa posted at 45,00 on Oct 25 and the bank row at 43,89 on Oct 27, confirming with the update ticked leaves exactly one Endesa entry: 43,89 on Oct 27, still linked to its template and period. Unticking the update keeps 45,00.
- **Re-import:** importing the same statement again shows that entry's row as "Already imported", not "Recurring".
- **Undo:** undoing the import restores 45,00 on Oct 25 and the previous fingerprint, and removes the imported rows as before.
- **Frozen entries:** for a cash-linked, frozen matched entry, the update choice is disabled in the preview. A forged request that includes it is rejected, and nothing is written.
- **Stale preview:** an update for a position that is no longer flagged "Recurring" is rejected with nothing written.
- **Template still in sync:** after updating, "Post due" does not offer that period again.
- **Backup:** export → import round-trips `import_batch_updates`.
- **No regressions:** the CGD and ActivoBank fixture tests pass unchanged.
- **Checks:** `pnpm typecheck && pnpm lint && pnpm test` pass.
