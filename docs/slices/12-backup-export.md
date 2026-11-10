# Slice 12 — JSON Backup, Export and Restore

## Goal

Full-database JSON export and import so the user can back up years of hand-entered data, restore after a machine change, and inspect raw data in a readable format.

## In scope

- **Export**: a GET route that returns the entire database as a versioned JSON file download.
- **Import**: a POST route that accepts a JSON file, validates it completely, then replaces all data inside one transaction.
- **UI**: an Export button and an Import file-input (with explicit confirmation) on the Settings page.
- **Slice file**: this file at `docs/slices/12-backup-export.md`.

## Out of scope

- Per-table or per-date partial exports.
- CSV format.
- Automated backup scheduling.
- Cloud storage or remote destinations.

## Export format (version 1)

```json
{
  "version": 1,
  "exportedAt": "2026-11-10T12:00:00.000Z",
  "settings": [{ ...all columns }],
  "assets": [...],
  "liabilities": [...],
  "value_snapshots": [...],
  "categories": [...],
  "expenses": [...],
  "incomes": [...],
  "goals": [...],
  "personality_answers": [...],
  "investor_profiles": [...]
}
```

`ai_results` is excluded — it is a cache and regenerates automatically.

## Import contract

- Validate `version === 1` and all table keys present before touching the DB.
- Validate each record's required fields (type checks).
- Reject the entire payload if any record fails validation; no partial write.
- Perform all deletes and inserts inside one `db.transaction()`.
- Delete in dependency order so FK constraints are not violated:
  1. `expenses`, `incomes` (reference categories, assets, snapshots)
  2. `value_snapshots` (reference assets, liabilities)
  3. `categories`, `goals`, `personality_answers`, `investor_profiles`
  4. `assets`, `liabilities`
  5. Update `settings` row (never delete — the migrate seed row stays)
- Insert in FK-safe order: settings → assets → liabilities → categories → value_snapshots → expenses → incomes → goals → personality_answers → investor_profiles.
- Original `id` values are preserved so FK relationships are intact.

## Files

- `docs/slices/12-backup-export.md` ← this file
- `src/db/repositories/backup.ts` — `exportDatabase()`, `importDatabase(data)`, `BackupData` type, Zod schema
- `src/app/settings/export/route.ts` — GET handler
- `src/app/settings/import/route.ts` — POST handler
- `src/app/settings/backup-section.tsx` — client component with Export button and Import form
- `src/app/settings/page.tsx` — add `<BackupSection />`

## Acceptance

- Export → wipe DB (manual) → import reproduces identical net worth, snapshots, settings and profile.
- A malformed or wrong-version import returns an error with no partial write.
- An import with an unknown extra key is accepted (forward-compatibility).
- The UI confirms before importing with a clear warning that existing data will be replaced.
