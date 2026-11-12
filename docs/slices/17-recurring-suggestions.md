# Slice 17 — Recurring templates suggested from history

## Goal

Spot the monthly patterns already in the journal (loan instalments, insurance, utilities, subscriptions, account fees, salary) and offer each one as a pre-filled recurring template. The user ticks which to create. Nothing is created automatically, and the posted history is never changed.

## In scope

### Detection (pure, `src/domain/recurring-detect.ts`)

`detectRecurring(rows, templates, asOf)` returns suggestions. The input is journal rows (expenses and incomes) from the 6 months before `asOf` that were **not** posted by a template.

1. **Group** rows by kind and normalized description, using the existing `normalizeDescription` (it strips bank prefixes and card digits).
2. **Split a group when one description covers two payments a month.** For example, "COBRANCA PRESTACAO" is two loans, 395,59 and 331,30. With `k` = the most occurrences of the group in any calendar month, sort the amounts and split at the `k − 1` largest gaps. A group seen at most once a month stays whole, even if its amount varies (Gold Energy 27,13–36,49).
3. A cluster is **monthly** when it has **≥ 3 occurrences** and every gap between consecutive occurrences is **24–38 days**. That is wide enough for a bill sliding between the 29th and the 1st (Aug 31 → Sep 29 → Nov 1).
4. It must be **still active**: the last occurrence is within 45 days of `asOf`.
5. It must not already be **covered by a template**: skip it when an existing template of the same kind has a `match_text` contained in the description, or a description that normalizes to the same text.

Each suggestion carries:

| Field | Value |
|---|---|
| `kind` | expense or income |
| `note` | the latest raw description |
| `matchText` | the normalized description |
| `amountCents` | the latest amount |
| `amountVaries` | true when the highest and lowest amounts differ by more than 1% |
| `categoryId` | the category used most often in the cluster, ties going to the latest |
| `cadence` | `monthly` |
| `anchorOn` | the **next expected date**: one month after the last occurrence (clamped to month end). A median day of month would break for payments that straddle the month end, such as Aug 31 → Sep 29 → Nov 1 |
| evidence | occurrence dates and amounts, for display |

**Why the anchor is the next expected date:** starting the template after the last seen occurrence means "Post due" never re-creates months already in the journal. Those came from imports or manual entry and have no template link, so duplicates wouldn't be caught.

### UI (Activity → Recurring tab)

- A **"Suggested from your history"** section above the template list, shown only when there are suggestions. It is collapsed by default (`<details>`) with a count: "8 suggestions".
- **One row per suggestion:**
  - checkbox, unticked by default
  - editable description
  - kind
  - editable amount, with "varies" when relevant
  - category select, prefilled
  - next date
  - evidence, e.g. "Seen 3×: Aug 17, Sep 15, Oct 15 · €395.59"
- **"Create selected templates"** creates them in one transaction, then redirects with "N recurring entries created." The created templates then appear in the normal list, and their suggestions disappear.
- **Server side:** the action re-runs detection, takes each selected suggestion by a stable key (`kind|matchText|cluster index`), and applies the user's description, amount and category. A key that no longer matches gives "This suggestion is out of date. Reload and try again."
- Validation and creation reuse `createTemplate` (`src/db/repositories/recurring.ts`), including `match_text`, so later imports recognise rows these templates post.

### Tests

The CGD fixture's candidates go in as journal rows, with `asOf = 2026-11-12`. Expected suggestions include:
- COBRANCA PRESTACAO 395,59 (next 2026-11-15) **and** 331,30 (next 2026-11-20), as separate suggestions
- REALVSEGUROS 9,74 and 8,00
- ENDESA ENERGIA and GOLD ENERGY COMERCI, both `amountVaries`
- C CLASSIC 8,99
- MANUT CONTA PACOTE CA 4,16
- VODAFONE PORTUGAL COM
- TRF OLX PORTUGAL SA, income, `amountVaries`
- TFI RITA GOMES ALVES 425,00, income (next 2026-12-01)
- MUNICIPIO DE AMARES (water), `amountVaries`
- TRF Ana Maria Sousa C, the monthly own-account transfer, because the fixture feeds every row in. In real data it is suggested only if it was imported.

Card purchases at CP 117 PORTELA (several a month, irregular) and one-off Amazon orders are **not** suggested.

## Out of scope

- Dismissing a suggestion permanently. It reappears until a matching template exists or the pattern stops.
- Weekly or yearly patterns.
- Linking past journal rows to the new template, or back-posting anything.
- Choosing a cash account in the suggestion row (edit the template afterwards).
- Excluding own-account transfers specially: whatever is in the journal is treated as the user's choice.

## Acceptance

- **Fixture:** produces exactly the suggestions listed in Tests. Each has the stated amount and next date, and the two loans stay separate.
- **Already covered:** a pattern whose template already exists, matched by `match_text` or by description, is not suggested.
- **Already posted:** rows posted by a template never feed detection.
- **Stopped patterns:** a pattern whose last occurrence is more than 45 days before `asOf` is not suggested.
- **Creating:** ticking two suggestions and editing one amount creates exactly two templates, with the edited amount and their `match_text`. The suggestions then disappear.
- **Next due date:** after creating a template, "Post due" lists nothing until its next date. The months already in the journal are never re-posted.
- **Out-of-date suggestions:** a stale key is rejected, and nothing is created.
- **Checks:** `pnpm typecheck && pnpm lint && pnpm test` pass.
