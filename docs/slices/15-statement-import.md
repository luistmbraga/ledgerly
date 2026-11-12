# Slice 15 — Statement import (pipeline + CGD PDF)

## Goal

Backfill the journal from a bank statement file instead of typing each row. The user uploads a statement, previews every row (with duplicate and transfer flags and a balance check), confirms, and can undo the whole import later. This slice builds the shared import pipeline and its first source: the CGD "Consultar saldos e movimentos à ordem" PDF export. Nothing is written without the preview → confirm step.

**Scope lock.** This slice lifts the "Manual data" lock for **user-uploaded statement files with preview → confirm** only. Bank APIs, automatic sync and background imports stay out of scope. Update the `AGENTS.md` row and the `docs/product.md` non-goal to say so.

## In scope

### Schema
- New `import_batches` table:
  - `id`, `source` (`pdf`), `parser_id` (e.g. `cgd-movimentos`), `file_name`, `file_sha256`
  - `period_from`, `period_to` (nullable ISO dates), `closing_balance_cents` (nullable)
  - `asset_id` (FK set null), `link_mode` (`none` | `closing` | `per_row`)
  - `closing_snapshot_id` (FK set null), `row_count`, `created_at`
- On `expenses` and `incomes`, add:
  - `import_batch_id` (FK set null)
  - `import_fingerprint` (text, indexed)

  Use a table rebuild in the migration so the FK really is `ON DELETE SET NULL`, as in migration 0014.
- Include the new table and columns in the JSON backup export/import. Older backups must still import.

### Reading the file
- An upload action accepts one PDF, up to 5 MB. It is read **in memory only**: never written to disk and never stored. Only its SHA-256 and file name are kept.
- Text is extracted locally with the `unpdf` dependency. No network call is made.
- A PDF with no text layer gets the message: "This PDF has no selectable text (scanned?). Download the digital statement from your bank instead."
- Password-protected or unreadable PDFs get a clear message instead of an error page.
- Parsers live under `src/import/parsers/` and share one interface: `{ id, label, detect(text), parse(text) }`. `parse` returns raw rows plus statement metadata.
- A PDF that no parser recognises gets: "This statement format isn't supported yet." The AI fallback is slice 16.

### CGD parser (`cgd-movimentos`)
- **Detection:** "Caixa Geral de Depósitos" and "Consultar saldos e movimentos" both appear in the text.
- **Rows:** one movement per line, `Data mov. · Data-valor · Descrição · Montante · Saldo após movimento`. Dates are DD-MM-YYYY and amounts use PT format (`-2.027,00`).
  - Skip the column header repeated on every page, the page footer and the closing contact text.
- **Metadata:**
  - closing balance = header "Saldo contabilístico"
  - period = "Intervalo de … a …"
  - account holder = "Cliente …", kept in memory for transfer flags only and never stored
- **Order:** the PDF lists rows newest first. Reverse that to get chronological order, which also preserves the posting order of rows on the same day.
- **Dates:** `occurredOn` = **Data-valor** (when the money was actually spent). Data mov. is used only for ordering.

### Shared pipeline
- `src/lib/bank-amount.ts`:
  - `parseBankAmount(raw, { decimal: "," | "." })` returns **signed** cents. It handles thousands separators, a leading minus, `€`/`EUR` suffixes and parenthesised negatives, and rejects anything else.
  - `parseBankDate(raw, "DD-MM-YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD")` returns an ISO date or null.
  - `parseMoneyToCents` stays untouched.
- **Reconciliation** (pure, `src/domain/import-reconcile.ts`):
  - When every row has a running balance, check `previous balance + amount = balance` along the chain. Report the first row that doesn't follow and by how much.
  - Check that the last balance equals the header's closing balance.
  - Show a green "Balances reconcile" badge, or a warning naming the row. A mismatch warns but does not block.
- **Normalization** (pure, `src/domain/import-normalize.ts`):
  - Negative amounts become expenses and positive ones incomes, stored as positive cents.
  - The note is the raw description (≤ 500 chars).
  - A normalized description strips `COMPRAS C.DEB `, `COMPRA `, `TRF `, `TFI `, `Trf Mbway `, folds case and collapses spaces.
  - **Category suggestion:**
    1. the category of the most recent existing row with the same normalized description;
    2. otherwise a keyword match (`category-suggest.ts`);
    3. otherwise uncategorized.

    Never fall back to "most used category". No AI.
- **Duplicate and transfer flags** (pure, `src/domain/import-dedupe.ts`):
  - **Fingerprint** = `occurredOn|amountCents|kind|normalizedDescription|n`, where `n` counts identical rows on the same day within the statement. Two real identical purchases stay distinct.
  - **Exact** — the fingerprint already exists in the journal. This is the overlapping-download case. Unticked by default.
  - **Likely, manual** — a journal row without a fingerprint, same kind and amount, within ±3 days. Unticked by default, and the preview shows the matching row.
  - **Likely, recurring** — a row posted by a recurring template for the same period, where the description contains the template's `match_text`, or (when the template has no match text) the amount is within ±20%. Unticked by default.
  - **Own-account transfer** — the description contains the start of the account holder's name. Unticked by default.
  - **Offsetting pair** — same day, equal and opposite amounts. Both rows unticked by default.
  - **Same file** — re-uploading a file whose SHA-256 matches an earlier batch shows a banner.
- **Recurring templates:** add a "Bank description contains" field (`match_text`, optional, ≤ 100 chars) to the slice 14 template form.

### Preview, confirm and undo
- New route `/activity/import`, linked from Activity and from the dashboard quick actions.
- **Step 1 — upload:** the file, plus a cash account (optional, cash assets only) and a **link mode**:
  - **None** — journal rows only.
  - **Closing balance** (default when an account is chosen and the statement has a closing balance) — rows import unlinked, plus **one** snapshot of the closing balance dated the statement's end date.
    - It is skipped, with a note in the preview, if the account already has a snapshot on or after that date.
  - **Per row** — each row creates a cash-linked snapshot, in chronological order.
    - Rows dated before the account's latest snapshot import unlinked, marked in the preview.
    - A row that would make the balance negative blocks confirm.
    - The preview warns "N rows will add N balance snapshots".
- **Step 2 — preview table**, every row shown:
  - include checkbox, date, description, kind, amount, category select (prefilled), note (editable)
  - a flag badge with its reason
  - a summary: rows, selected, total in / out, reconciliation badge
- **Step 3 — confirm.**
  - The server re-validates every selected row with Zod and the repository rules, never trusting client values.
  - It inserts the rows, the batch row and the optional closing snapshot in **one transaction**. Any failure writes nothing and points to the failing row.
- **Recent imports** list on the import page: file name, period, row count, date, **Undo**.
  - Undo deletes the batch's rows newest first through the existing delete path, removes its closing snapshot if no journal row references it, then deletes the batch, all in one transaction.
  - If any per-row linked entry is frozen (a newer balance exists), the whole undo is refused with an actionable message.

### Fixtures and tests
- `src/import/parsers/__fixtures__/cgd-movimentos.txt` holds the extracted text of the real 90-day statement. The holder name, NIF, account number, and personal names in transfer descriptions are replaced by synthetic values; dates, amounts and balances are kept, so the chain still reconciles. **The real PDF is never committed.**
- An optional local test parses the real PDF when `LEDGERLY_CGD_SAMPLE` points to it, and is skipped otherwise.

### Docs
Update `AGENTS.md`, `docs/product.md`, `docs/data-model.md` and `docs/ux.md` (import screen, empty and error states).

## Out of scope

- CSV import and column mapping (slice 16).
- ActivoBank or any other bank or format, including CGD's monthly "extrato" PDF layout (slice 16, as samples arrive).
- AI extraction for unknown formats (slice 16).
- OCR or scanned PDFs, and unlocking password-protected PDFs.
- Storing uploaded files.
- Saved categorization rules, and modelling transfers as their own entity (they are only flagged).
- Multi-currency statements (non-EUR when the display currency is EUR is rejected).
- Suggesting recurring templates from imported history.

## Acceptance

- **Parsing:** the CGD fixture parses with no network call into the exact row count. Every running balance chains, and the last equals the header's closing balance (5.485,55). The reconciliation badge is green.
- **Value dates:** the Leroy Merlin row with movement date 28-10 and value date 16-10 is dated 2026-10-16.
- **Transfers:** own-account transfers and the same-day ±1.500 "Vi Tr" pair are flagged and unticked.
- **Broken chain:** removing one line from the fixture makes reconciliation name the first row that no longer follows.
- **Bad amounts:** a malformed amount in a row blocks confirm, and nothing is written.
- **Same file twice:** importing the fixture twice flags every row of the second import as an exact duplicate and shows the same-file banner.
- **Overlapping statements:** an overlapping later statement flags only the overlap.
- **Real repeats:** two identical rows on the same day both import.
- **Recurring overlap:** a recurring-posted row whose template `match_text` is found in the bank row is flagged "likely, recurring".
- **Closing balance mode:** with a cash account, exactly one snapshot is written (5.485,55 on 2026-11-10) and net worth reflects it. It is skipped with a note when a later snapshot exists.
- **Per row mode:** rows before the latest snapshot import unlinked as announced in the preview.
- **Undo:** removes exactly the batch's rows and its closing snapshot. It is refused, with nothing deleted, when a per-row linked entry is frozen.
- **Bad files:**
  - A scanned or unrecognised PDF gets its clear message.
  - A file over 5 MB is rejected before parsing.
- **Backup:** export → import round-trips batches and row links.
- **Checks:** `pnpm typecheck && pnpm lint && pnpm test` pass.
