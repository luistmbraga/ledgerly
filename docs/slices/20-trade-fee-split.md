# Slice 20 — Split a fee off an investment trade

## Goal

A broker trade row such as Trade Republic's "Buy trade … 1 501,07 €" is mostly money moving into a holding. The holding is tracked as its own asset with manual snapshots, but part of the row (here 1,07 €) is a fee, which is a real expense. This slice lets the user split the fee off in the import preview so that only the fee reaches the journal.

## In scope

- **Preview:** each row flagged "Investment trade" gets a **Split off a fee** field.
  - A valid fee (above zero and below the trade amount; `1.07` or `1,07`) ticks the row. The row then shows as an expense of the fee ("fee of a 1 501,07 € trade"), offers expense categories, and its note becomes `Fee: <description>` if the note hadn't been edited.
  - Clearing the field puts the row back as the unticked trade.
  - An invalid fee shows its error and blocks import.
  - Totals count the fee, not the trade.
- **Server:** each selection may carry `feeCents`. The confirm action recomputes the flags and accepts a fee only on an `investment_trade` row, and only when 0 < fee < trade amount. That row is imported as an expense of the fee. Pure rules live in `src/domain/import-fee.ts`.
- **Re-import:** the fee row keeps the trade row's fingerprint, so importing the statement again flags the buy trade as already imported.

## Out of scope

- Reading the fee from the statement (it prints only the total).
- Creating or updating the investment asset or its snapshot from the trade.
- Fees on rows that aren't flagged as investment trades.
- **Per-row balance mode:** the split row moves the cash account's balance by the fee only, just as an unticked trade doesn't move it at all. Closing-balance mode is unaffected.

## Acceptance

- [x] `parseTradeFee` accepts "1.07" and "1,07" for a 1 501,07 trade, and rejects zero, malformed and too-large fees.
- [x] The server refuses a fee on a row that isn't an investment trade, and imports a valid fee as an expense of that amount for both buy and sell trades.
- [x] **Checks:** `pnpm typecheck && pnpm lint && pnpm test` pass.
