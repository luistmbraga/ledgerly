# Slice 10 — Derive cashflow from balance snapshots

## Goal

Produce `avgMonthlySurplusCents` from balance snapshot deltas when the journal is empty,
so emergency-fund trajectory and goal feasibility work from day one on data the user already enters.

## In scope

- Pure module `src/domain/derived-cashflow.ts`: `deriveMonthSurplus(assets, range, defaultAnnualReturnBps?)`.
- Precedence rule wired into `getEmergencyFund` and `loadFinancialSnapshot`:
  journal wins for a month when at least one income **or** expense entry exists in that month;
  derived fills months with no journal entries.
- `avgMonthlySurplusOverride` optional parameter added to `computeEmergencyFund` (backward-compatible).
- `surplusSource: "journal" | "derived" | "none"` and `surplusConfidence` added to `EmergencyFundResult`.
- Batch snapshot query `listAllSnapshotsByAssetIds` in the snapshots repository.
- Confidence and assumption note shown on the emergency-fund page when source is `"derived"`.
- Domain section and formula documented in `docs/domain.md`.

## Out of scope

- NF-2 (monthly update screen) — a second month of snapshots is needed before this produces useful output;
  ship NF-2 alongside or immediately after.
- NF-5 (dashboard rebuild) — derived KPIs on the dashboard are part of NF-5.
- Category breakdown — derived cashflow cannot produce one; mention that plainly in the UI note.
- Configurable expected-return per asset — use the global default (500 bps = 5%) in this slice.

## Algorithm

### Cash assets (`cashPct === 100`)

```
opening = latest snapshot with recordedOn < range.start  (0 if none — new asset)
closing = latest snapshot with recordedOn <= range.end   (skip asset if none)
cashflowCents = closing.amountCents - opening.amountCents
confidence = "high" if both exist, "estimated" if opening was assumed 0
```

### Investment assets (`cashPct < 100`)

```
monthlyRate = defaultAnnualReturnBps / 10_000 / 12
estimatedReturnCents = round(opening.amountCents × monthlyRate)   // round half away from zero
cashflowCents = (closing.amountCents - opening.amountCents) - estimatedReturnCents
confidence = "estimated"
```

### Overall

```
surplusCents = sum of cashflowCents across all contributing assets
confidence = "insufficient_data" if no assets contributed, else min(individual confidences)
```

### Precedence (service layer, per month)

```
for each of the 3 trailing months:
  if any income or expense entry exists in month → use journal for that month
  else                                           → use derived
avgMonthlySurplusCents = round( sum of per-month surpluses / 3 )
source = "journal"  if all 3 months used journal
       = "derived"  if all 3 months used derived
       = "derived"  if mixed (derived figures dominate the gap)
confidence = worst confidence across derived months; null when source is "journal"
```

## Acceptance

- `deriveMonthSurplus` unit tests pass for: cash-only, cash+investment, transfer month, negative-return month,
  no snapshots (→ `insufficient_data`), new asset with no opening snapshot (→ `estimated`).
- With the live dataset (8 assets, no journal), emergency fund shows a non-null `monthsToCloseGap`
  and goals show a surplus-based status.
- A month with any journal entry uses the journal and is not double-counted (service-layer test).
- Every derived figure on the emergency-fund page carries a visible source/confidence note.
- All existing tests continue to pass.
