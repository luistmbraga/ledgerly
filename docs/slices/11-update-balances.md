# Slice 11 — Monthly "Update balances" screen

## Goal

A single `/update` route that lets the user update all asset and liability balances in one form submission, replacing the need to visit each individual detail page.

## In scope

- Route `/update`: lists every asset and every liability with its latest snapshot value prefilled.
- One shared date field (defaults to today UTC).
- One submit that writes only the rows whose value changed, in a single transaction.
- Skip rows where the submitted amount equals the current latest snapshot amount.
- Per-row inline validation; a single invalid row blocks the batch with no partial write.
- Cash assets are marked visually; a note explains that adding a newer snapshot will freeze any linked journal entries (expected behavior — not blocked).
- "Update" link added to primary sidebar navigation.
- After a successful submit: redirect to `/update?saved=1` with a flash message.
- If no rows changed: redirect with an informational message, no DB write.

## Out of scope

- Editing asset/liability metadata (name, type, notes).
- Adding notes per snapshot row.
- Partial batches (write some rows despite errors in others).
- CSV import or automated balance sync.

## Files

- `docs/slices/11-update-balances.md` (this file)
- `src/app/update/page.tsx` — server component
- `src/app/update/update-form.tsx` — client component
- `src/app/update/actions.ts` — server action
- `src/db/repositories/snapshots.ts` — add `batchAddSnapshots`
- `src/components/sidebar.tsx` — add Update nav item
- `docs/ux.md` — add `/update` to navigation map

## Acceptance

- All assets and liabilities visible on one screen with prefilled current values.
- Submitting unchanged values writes nothing to the DB.
- One invalid amount blocks the batch; all errors surfaced at once; no partial write.
- Submitting valid changes writes all changed rows atomically; redirects with success flash.
- Cash asset rows display a note about journal freeze behavior.
- "Update" appears in primary navigation.
