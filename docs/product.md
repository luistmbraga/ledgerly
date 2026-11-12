# Product specification

## Purpose

Ledgerly helps one person understand **net worth**, **cashflow**, **financial resilience** (emergency fund), **goal progress**, and **high-level investment posture**—with optional AI that explains what the app already calculated.

It is a **personal tool**, not a regulated advisory product.

## Target user

- One individual managing their own finances.
- Enters balances and transactions manually, or imports a downloaded bank statement after previewing every row.
- Uses a desktop browser first; mobile browser is acceptable.

## Goals (user outcomes)

1. See total net worth and how it breaks down by asset type and liabilities.
2. Log income and expenses; categorize spending.
3. Get actionable feedback on where spending could improve (rules + optional AI tips).
4. Complete a short investor self-assessment and see a **revealed** personality label once finished.
5. Know emergency fund target, current funding, and gap.
6. Set short/mid/long goals and see whether the timeline is feasible and required monthly savings.
7. After profile exists, read an **investment briefing** aligned to personality, emergency fund, goals, and current allocation—without stock picks.

## Non-goals (v1)

- Multi-user accounts, sharing, or cloud sync as a product feature.
- Bank, card, or brokerage aggregation (connecting to bank APIs or syncing automatically). Uploading a statement file and confirming its rows is allowed (slice 15).
- Multi-currency portfolios with live FX.
- Double-entry bookkeeping or forced reconciliation between journal and balance snapshots.
- Tax filing, withholding, or jurisdiction-specific legal advice.
- Live market prices, ticker search, or trade execution.
- MiFID-style suitability or clinical psychometric scoring.

## Locked product decisions

| Topic | Decision |
|-------|----------|
| Net worth | Sum of latest asset snapshots minus sum of latest liability snapshots (same display currency). |
| Balance updates | User posts new snapshots; history retained. |
| Cashflow | Income/expense journal drives categories, tips, emergency fund spend average, savings rate. An expense or income may optionally link to a **cash** asset and append a value snapshot; other asset types stay on manual snapshots. No full double-entry reconciliation. |
| Emergency fund | Target months × essential monthly spend; eligible balance from liquid assets flagged for the fund. |
| Goals | User sets aside amount + target date; calculator returns status and required monthly contribution. |
| Personality | Self-assessment quiz; result hidden until complete; stored and viewable; retake replaces result. |
| AI | Optional; app fully usable without API key. |
| Language | English UI. |
| Currency | Single display currency (setting); default `EUR`. |

## Glossary

| Term | Definition |
|------|------------|
| Asset | Something the user owns with economic value (cash, investments, property, etc.). |
| Liability | Something the user owes (mortgage, loan, credit card balance, etc.). |
| Value snapshot | A dated record of an asset or liability value in cents. Latest snapshot = current value. |
| Net worth | Total assets − total liabilities (from snapshots). |
| Income entry | Money received; increases understanding of cashflow (not auto-deposited to an asset balance). |
| Expense entry | Money spent; has category; may be marked essential via category. |
| Essential spend | Expenses in categories flagged `isEssential`, or user override for emergency fund math. |
| Emergency fund eligible | Liquid assets the user marked as counting toward the emergency fund. |
| Goal | Savings target with horizon bucket (short/mid/long), target amount, target date, amount already set aside. |
| Investor profile | Result of personality quiz: label + dimension scores + completed timestamp. |
| Finding | Rule-based signal (e.g. emergency fund gap) with structured fields for templates or AI. |
| Financial snapshot | Read-only aggregate JSON built for AI tasks from DB + calculators (no secrets). |
| Briefing | Educational text + allocation band from code; AI may rewrite prose only. |

## Asset types (enum)

`cash`, `brokerage`, `crypto`, `real_estate`, `vehicle`, `retirement`, `business`, `receivable`, `other`

Liquid types for emergency eligibility (default suggestion in UI, user confirms per asset): `cash` only unless user marks another asset liquid.

## Liability types (enum)

`mortgage`, `loan`, `credit_card`, `other`

## Goal horizon buckets

Derived from **months until target date** at creation/update:

| Bucket | Months until target |
|--------|---------------------|
| `short` | &lt; 12 |
| `mid` | 12–59 |
| `long` | ≥ 60 |

## Compliance posture (copy, not legal advice)

- Personality: labeled **self-assessment**, not a clinical or regulatory test.
- Investment briefing: **educational**, not personalized securities advice; user must see a short disclaimer on the briefing screen.
- AI tips: suggestions only; user remains responsible for decisions.

## Success criteria for v1 release

- User can maintain assets/liabilities and see net worth.
- User can log income/expenses and categorize expenses.
- Emergency fund and goals pages show deterministic numbers matching domain formulas.
- Personality quiz reveals once; briefing gated until complete.
- Findings visible without AI; with AI key, narrated tips and briefing prose.

## Related documents

- Formulas and rubrics: [domain.md](domain.md)
- Tables: [data-model.md](data-model.md)
- Screens: [ux.md](ux.md)
- Build order: [roadmap.md](roadmap.md)
