# Slice 22 — Interest rates on accounts

## Goal

Let the user record the annual interest rate an asset earns or a liability charges, and use it where it changes the numbers: the net worth projection, the what-if debt lever, and the briefing.

## In scope

- Optional `annual_rate_bps` on `assets` and `liabilities` (migration `0017_account_interest_rates`). Null = not recorded; 0 = explicitly none. Range 0–100%. Included in backup export/restore.
- Optional "Annual interest rate (%)" field on the asset and liability forms; the rate shows on list rows and detail headers.
- `src/domain/interest.ts`: simple yearly interest earned/charged and balance-weighted rates from latest balances.
- `projectNetWorth` takes optional rated balances: they compound at their own rate in every scenario, the rest uses the scenario return and receives the surplus. No rated balances = unchanged output.
- What-if: rated balances step the same way; the debt lever uses the liability's recorded rate when the rate field is blank.
- Findings `costly_debt` (warn, rate ≥ 8%) and `idle_cash` (info, unrated cash above the emergency fund target, more than 1,000).
- Financial snapshot `interest` block; briefing input and fallback include formatted interest figures. `DOMAIN_VERSION` and `BRIEFING_VERSION` bumped.
- `docs/domain.md`, `docs/data-model.md`, `docs/ux.md` updated.

## Out of scope

- Variable or promotional rates, rate history, compounding frequency, tax on interest.
- Auto-posting interest as income or adjusting balances.
- Debt terms, amortisation schedules, payoff dates; liability interest inside the net worth projection.
- Correcting for interest that is both rated and logged as income (documented as a limitation instead).

## Acceptance

- [x] With no rates recorded, Projection and What-if figures are identical to before.
- [x] A rated asset grows at its own rate in the Conservative (0%) scenario; an explicit 0% asset stays flat under Growth.
- [x] An extra debt payment of zero still matches the Projection screen when rated assets exist.
- [x] Choosing a liability with a recorded rate and leaving the rate blank runs the what-if at that rate; a typed rate wins.
- [x] A liability at 8% or more with a balance produces the costly-debt finding; unknown or lower rates do not.
- [x] The briefing shows interest figures only from TypeScript-computed values; the AI may quote them, not compute them.
