# Slice 19 — Trade Republic statement import

## Goal

Import the Trade Republic (Portuguese branch) **"Account statement"** PDF through the slice 15 pipeline (preview → confirm → undo), so the Trade Republic cash account can be backfilled like CGD and ActivoBank. This slice adds a third parser, a shared helper for running-balance lines, and an "Investment trade" flag. It changes nothing about how imports are confirmed, stored or undone.

## What the format looks like

Based on the statement for 01 Aug – 09 Nov 2026 (3 pages; the movements are on page 1):

- **Detection:** "TRADE REPUBLIC BANK GMBH" and "RESUMO DO EXTRATO DE CONTA" both appear in the text.
- **Header:**
  - Period: `DATA 01 ago. 2026 - 09 nov. 2026`, with Portuguese month abbreviations.
  - The account holder is the line right after `BIC …`. It is used in memory only, for own-transfer flags.
  - Summary: `Conta corrente 17 086,40 € 5 106,33 € 1 501,07 € 20 691,66 €`, which is the opening balance, money in, money out and closing balance.
- **Movements:** listed under `TRANSAÇÕES`, and each one spans several lines:
  - the first line holds the day and month (`26 ago.`)
  - the next starts with the year and the type (`2026 Transferência Incoming transfer from …`)
  - the movement ends on the line that finishes with `<amount> € <balance> €`
  - Amounts use the PT format (`1 501,07 €`).
  - **Money in and money out are separate columns in the PDF, but the extracted text keeps only the number**, as with ActivoBank.
  - The table ends at `SÍNTESE DO BALANÇO`.
- **Everything else** is skipped:
  - the balance summary
  - the money market fund holdings and their transactions (internal sweeps)
  - the statement notes and the validity page
  - the page header and footer, and the repeated column header

## In scope

- **Shared helper** `src/import/parsers/running-balance.ts`. `readChainedLine(tail, previous, format)` tries every valid split of `<description> <amount> <balance>` and keeps the one that chains with the previous balance, then signs the amount from that. It can also expect a marker token after each amount (`€`). The ActivoBank parser uses it too, with unchanged behaviour.
- **`trade-republic-extrato` parser** in `src/import/parsers/trade-republic.ts`, registered in `src/import/parsers/index.ts`.
  - Wrapped lines are joined into one movement, even across a page break.
  - `occurredOn` = `postedOn` = the printed date, because the statement has only one date.
  - The known type (`Juros`, `Transferência`, `Comércio`, `Transação com cartão`, `Rendimentos`, `Bónus`, `Levantamento`) is dropped from the description. An unknown type stays in the description.
  - Direction comes from the running balance, starting from the summary's opening balance. A line that no split can chain becomes a row with an issue, which blocks confirm.
  - **Metadata:** period, opening and closing balance, currency EUR, and the holder name.
  - **Note:** "Money market fund movements were not imported; they are internal to your Trade Republic account."
- **Normalization** learns `incoming transfer from ` and `outgoing transfer to `. With that, "Incoming transfer from <holder> (IBAN)" is flagged as an own transfer.
- **New flag `investment_trade`** ("Investment trade"): a normalized description that starts with `buy trade`, `sell trade` or `savings plan execution`. It is unticked by default and comes after the own-transfer flag in priority.
- **Fixture:** `src/import/parsers/__fixtures__/trade-republic-extrato.txt` uses synthetic values for the holder name, address and both IBANs. Dates, amounts and balances are kept. **The real PDF is never committed.**
  - An optional local test parses the real PDF when `LEDGERLY_TRADE_REPUBLIC_SAMPLE` points to it.
- **UI copy:** the upload hint lists all three supported statements.

## Out of scope

- Importing securities, fund units or trade quantities as assets or snapshots.
- Other Trade Republic documents (trade confirmations, tax reports) and statements in English or German.
- Linking the CGD → Trade Republic transfer pair across two imports.

## Acceptance

- [x] **Parsing:** the fixture parses with no network call into exactly 8 rows. The opening balance is 17 086,40 and the closing balance 20 691,66, every row chains, and reconciliation is green.
- [x] **Direction:** the 01-08 interest payment is income of 23,04, and the 04-11 "Buy trade IE0000VITHT2 …" is an expense of 1 501,07.
- [x] **Page breaks:** a movement split by page boilerplate still parses.
- [x] **Ambiguous amounts:** a description that ends in digits is split correctly using the balance chain.
- [x] **Broken chain:** a wrong opening balance puts an issue on row 1.
- [x] **Flags:** the three incoming transfers are flagged as own transfers, the buy trade as an investment trade, and the interest rows are not flagged.
- [x] **Re-import:** importing the fixture twice flags every row of the second import as already imported.
- [x] **No regressions:** the CGD and ActivoBank tests pass unchanged, and none of the three detectors matches another bank's text.
- [x] **Checks:** `pnpm typecheck && pnpm lint && pnpm test` pass.
