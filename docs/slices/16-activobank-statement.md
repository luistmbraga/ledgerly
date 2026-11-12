# Slice 16 — ActivoBank statement import

## Goal

Import the ActivoBank monthly **"Extrato Combinado"** PDF through the slice 15 pipeline (preview → confirm → undo), so both of the user's banks can backfill the journal. This slice adds a second parser plus the small shared changes that format needs. It changes nothing about how imports are confirmed, stored or undone.

## What the format looks like

Based on statement `2026/011` (October 2026, 17 pages, of which only page 2 holds movements):

- **Detection:** "ActivoBank" and "EXTRATO COMBINADO" both appear in the text.
- **Header:**
  - The account holder is on a line wrapped in markers, `#S#<NAME>#E#`, as the first such line. It is used in memory only, for own-transfer flags.
  - Account section: `CONTA SIMPLES N. <number> MOEDA: EUR`.
  - Period: `EXTRATO DE 2026/10/01 A 2026/10/30`.
  - `SALDO INICIAL <amount>` opens the movements and `SALDO FINAL <amount>` closes them. Both are printed.
- **Movements:** `MM.DD MM.DD DESCRIPTION AMOUNT BALANCE`, for example `10.26 10.26 TRF. P/O LUIS TIAGO MACHADO BRAGA 2 027.00 3 758.88`.
  - **Dates have no year.** The year comes from the statement period.
  - **Amounts use a dot for decimals and a space for thousands** (`2 027.00`).
  - **Debit and credit are separate columns in the PDF, but the extracted text keeps only the number**, so the direction is not in the text.
  - Every row has a running balance.
- **Everything else** is skipped: the bank's messages, the account summary ("RESUMO DAS CONTAS"), the deposit-guarantee notice, and the 15 pages of updated terms.

## In scope

- **`activobank-extrato` parser** in `src/import/parsers/activobank.ts`, registered in `src/import/parsers/index.ts`.
  - Reads only the lines between `SALDO INICIAL` and `SALDO FINAL` of the first `CONTA … MOEDA:` section.
  - If the statement holds more than one account section, the preview says which one was imported and that the others were ignored.
  - **Dates:** `occurredOn` = the value date (`DATA VALOR`) and `postedOn` = `DATA LANC.`. The year is taken from the statement period. When a period crosses a year end, a date whose month falls after the end month belongs to the earlier year.
  - **Amount and direction from the running balance.** For each line, read the balance and the amount, then sign the amount by the balance change from the previous row (starting from `SALDO INICIAL`): `previous + amount = balance` means income, `previous − amount = balance` means expense.
    - Space-separated thousands can make a split ambiguous (`LOJA 12 345.00 1 000.00`). The parser tries each valid split and keeps the one that chains.
    - A line that no split can chain becomes a row with an issue, which blocks confirm.
  - **Metadata:** opening balance, closing balance (`SALDO FINAL`), period, currency (`MOEDA`) and holder name.
  - Rows are already oldest-first, so no reversal is needed.
- **`parseBankAmount`** gains a `"." decimal + space thousands` mode (`2 027.00`). The existing modes are unchanged.
- **Opening balance in reconciliation:** `reconcileRunningBalance` takes an optional printed opening balance. When there is one, the first row must also follow from it, and a mismatch names row 1.
- **Shared description normalization** learns ActivoBank's movement prefixes, so category reuse, fingerprints and own-transfer flags work:
  - `compra 1234 ` and `cred. 1234 ` — the 4 digits are the card's last digits and are dropped
  - `lev atm 1234 `
  - `trf mb way p/ `
  - `trf. p/o `
  - `trf p/ `

  Existing CGD fingerprints are unaffected, because none of their descriptions start with these prefixes.
- **Own-transfer flag:** matches when the description, after prefixes, starts with the holder's name, in either the full or the truncated form. This covers "TRF. P/O LUIS TIAGO MACHADO BRAGA" (+2 027,00, the CGD → ActivoBank transfer on 26-10) and "TRF P/ Luis Tiago Machado Braga" (−1 500,00).
- **Refunds:** "COMPRA … STRIPE IRELAND 49.99" and "CRED. … STRIPE IRELAND 49.99" on the same day are flagged as an offsetting pair. The existing rule already does this; it gets a test.
- **Statement doesn't match the current balance.** A monthly statement usually ends before the account's latest snapshot (here 30-10 versus your 07-11 balance). In "closing balance" mode the preview then says the closing balance won't be added. The existing `skip_newer` rule already does this; it gets a test with this statement's dates.
- **Fixture:** `src/import/parsers/__fixtures__/activobank-extrato.txt` is built from the October statement's extracted text with these replaced by synthetic values:
  - the holder name and address
  - the account number, NIB and IBAN
  - the card digits
  - the names of the people paid by MB WAY

  Dates, amounts and balances are kept. The bank's terms pages are cut from the fixture. **The real PDF is never committed.**
  - An optional local test parses the real PDF when `LEDGERLY_ACTIVOBANK_SAMPLE` points to it.
- **UI copy:** the upload hint lists both supported statements.

## Out of scope

- Other ActivoBank documents: credit-card statements, savings or term-deposit sections, and the "Movimentos" export from the app.
- The generic CSV column mapper (next slice).
- The AI fallback for unknown formats (a later slice).
- Portuguese merchant keywords for category suggestions (a separate small change).
- Linking the CGD → ActivoBank transfer pair across two imports.

## Acceptance

- **Parsing:** the ActivoBank fixture parses with no network call into exactly 26 rows. Opening 2 224,79 and closing 2 056,59 are read, every row chains, and reconciliation is green.
- **Direction:** "TRF. P/O LUIS TIAGO MACHADO BRAGA" is income of 2 027,00 on 2026-10-26, and "COMPRA 7526 RAY-BAN.COM 866-472-9226" is an expense of 137,00 on 2026-10-13.
- **Ambiguous amounts:** a test line whose description ends in digits (`LOJA 12 345.00 …`) is split correctly using the balance chain.
- **Unreadable rows:** a line that no split can chain is shown with an issue and blocks confirm.
- **Flags:** both own-account transfers are flagged, and so is the Stripe purchase/refund pair.
- **Closing balance:** with the "Conta AtivoBank" asset, whose latest balance is on 2026-11-07, "closing balance" mode reports the closing balance will be skipped, and confirming writes no snapshot.
- **Re-import:** importing the fixture twice flags every row of the second import as already imported.
- **No regressions:** the CGD fixture tests still pass unchanged, and the CGD and ActivoBank detectors don't match each other's text.
- **Checks:** `pnpm typecheck && pnpm lint && pnpm test` pass.
