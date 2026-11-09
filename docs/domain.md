# Domain model

Pure business rules for Ledgerly. Implement these in TypeScript (`src/domain/`) with unit tests. UI and AI must not redefine these formulas.

## Conventions

- All monetary amounts are **integers in cents** in the user's display currency.
- Dates are **UTC calendar dates** (`YYYY-MM-DD`) unless noted; use start-of-day for comparisons.
- Rounding: division for averages uses **integer cents** with **round half away from zero** unless stated.

---

## Entities (conceptual)

### Settings (singleton row)

- `displayCurrency`: ISO 4217 code (e.g. `EUR`).
- `emergencyFundTargetMonths`: integer, default `6`.
- `essentialMonthlySpendOverrideCents`: optional; if set, replaces computed essential average.
- `personalityRevealedAt`: null until quiz completed and reveal shown once (see Personality).

### Asset

- `type`: asset type enum.
- `name`: string.
- `isLiquid`: boolean (counts toward emergency fund if true).
- `includeInAllocation`: boolean (include in investment mix chart). Default true, except `real_estate`, `vehicle`, `receivable`, and `business`, which default to excluded.
- `sleevePercents`: `{ cash, bonds, equities, other }` integers that sum to 100. When omitted, use the type defaults below. Cash assets stay locked at 100% cash.

### Liability

- `type`, `name`.

### ValueSnapshot

- Polymorphic: belongs to exactly one asset **or** one liability.
- `recordedOn`: date.
- `amountCents`: for assets, value; for liabilities, **amount owed** (positive number representing debt).

**Current value:** snapshot with maximum `recordedOn` for that asset/liability; tie-break by largest `id`.

### Category

- `name`, `kind`: `expense` | `income`.
- `isEssential`: boolean (expense only; ignored for income).

### Expense / Income

- `amountCents`, `occurredOn`, `categoryId` (optional for expense until categorized), `note` optional.
- Optional `assetId`: must reference an asset with `type === cash`. When set, saving appends (or updates) a linked value snapshot so that cash balance moves: expense decreases, income increases. Missing prior snapshot treats balance as `0`. Resulting snapshot `amountCents` must stay ≥ 0.
- `linkedSnapshotId`: snapshot created for this cash link (null when unlinked).
- Snapshot `recordedOn` equals the entry `occurredOn`. Linking is rejected if `occurredOn` is before the asset’s current latest snapshot date (backdated entries must not hide under a newer balance).
- While the linked snapshot is still the asset’s latest: edits update that snapshot in place; clearing the account deletes that snapshot.
- After a newer snapshot exists on the asset: amount, date, and account are frozen (note/category remain editable). Deleting the journal row leaves snapshots unchanged.

### Goal

- `name`, `targetAmountCents`, `targetDate`, `setAsideCents`, `expectedAnnualReturnBps` optional (basis points, e.g. 500 = 5%).

### PersonalityAnswer

- One row per question key with selected option id.

### InvestorProfile (derived, stored on completion)

- `label`: enum (see Personality).
- Dimension scores 0–100 (see Personality).
- `completedAt`.

### AiResult (optional cache)

- `task`, `inputHash`, `promptVersion`, `outputJson`, `createdAt`.

---

## Invariants

1. Snapshot `amountCents` ≥ 0 for both assets and liabilities (debt stored as positive owed).
2. Deleting an asset/liability cascades snapshots (or soft-delete not used in v1—hard delete OK).
3. Expense category, if set, must be `kind === expense`.
4. Income category, if set, must be `kind === income`.
5. Expense/income `assetId`, if set, must reference a cash asset; linked snapshot balance stays ≥ 0.
6. Goal `targetDate` must be ≥ today when created (allow past dates only if user explicitly edits—default validate ≥ today).
7. Personality: `label` is null in UI until all required questions answered; stored profile only written on submit.

---

## Net worth

```
totalAssetsCents = sum(latestSnapshot(asset).amountCents for all assets)
totalLiabilitiesCents = sum(latestSnapshot(liability).amountCents for all liabilities)
netWorthCents = totalAssetsCents - totalLiabilitiesCents
```

Assets with no snapshot contribute `0` (UI should prompt user to add first snapshot).

---

## Cashflow aggregates

For a date range `[start, end]` inclusive:

```
incomeCents = sum(income.amountCents where occurredOn in range)
expenseCents = sum(expense.amountCents where occurredOn in range)
surplusCents = incomeCents - expenseCents
```

**Savings rate** (for findings, trailing 3 months):

```
savingsRate = surplusCents / incomeCents   if incomeCents > 0, else null
```

---

## Derived cashflow (snapshot-based surplus, NF-1)

When the journal has no entries for a trailing month, surplus is estimated from balance snapshot deltas.

**Cash asset** (`sleevePercents.cash === 100`):
```
opening = latest snapshot with recordedOn < month.start  (assumed 0 if none — new asset)
closing = latest snapshot with recordedOn <= month.end   (asset skipped if none)
cashflowCents = closing.amountCents − opening.amountCents
confidence = "high" if both opening and closing present, else "estimated"
```

**Investment asset** (`sleevePercents.cash < 100`):
```
monthlyRate = expectedAnnualReturnBps / 10_000 / 12   (default 500 bps = 5%)
estimatedReturnCents = round(opening.amountCents × monthlyRate)
cashflowCents = (closing − opening) − estimatedReturnCents
confidence = "estimated"
```

**Precedence rule (per trailing month):**
```
if any income or expense journal entry exists in month → use journal for that month
else                                                   → use derived
avgMonthlySurplusCents = round( sum of per-month surpluses / 3 )
```

`surplusSource` on `EmergencyFundResult` is `"journal"` when all months used the journal,
`"derived"` when any month used derived figures, or `"none"` when all derived months returned insufficient data.
Every derived figure in the UI must display a source/confidence note.

---

## Essential monthly spend (emergency fund input)

Default: average of **essential expense** over the last **3 full calendar months** ending before the current month.

For each month M in that window:

```
essentialInMonth(M) = sum(expense.amountCents where occurredOn in M and category.isEssential)
```

If an expense has no category, treat as **non-essential** for this average.

```
essentialMonthlyAverageCents = round( sum(essentialInMonth) / 3 )
```

If `settings.essentialMonthlySpendOverrideCents` is set, use it instead.

---

## Emergency fund

```
targetCents = essentialMonthlyAverageCents * settings.emergencyFundTargetMonths
eligibleCents = sum(latestSnapshot(a).amountCents for assets where a.isLiquid === true)
fundedRatio = eligibleCents / targetCents   if targetCents > 0, else null
gapCents = max(0, targetCents - eligibleCents)
```

**Months to close gap** (if surplus from trailing 3 months &gt; 0):

```
avgMonthlySurplusCents = round( sum(surplus per month) / 3 )   // same 3-month window as essential
monthsToCloseGap = gapCents / avgMonthlySurplusCents   (display as decimal, not integer month count)
```

If `avgMonthlySurplusCents <= 0`, monthsToCloseGap is `null` (show "increase surplus" message).

---

## Goal feasibility

Inputs: `setAsideCents`, `targetAmountCents`, `targetDate`, optional `expectedAnnualReturnBps`, `asOfDate` (default today).

```
monthsRemaining = full months from asOfDate to targetDate (minimum 1 if target is same month)
                  Month-end rule: if targetDate is the last day of its month and
                  asOfDate.day > targetDate.day, count the month as full (e.g. Jan 31 → Feb 28 = 1).
remainingCents = max(0, targetAmountCents - setAsideCents)
```

### Without return (default)

Required flat monthly contribution:

```
requiredMonthlyCents = ceil(remainingCents / monthsRemaining)
```

User's implied plan: if they only save `requiredMonthlyCents`, they hit target on date.

### With return (optional)

Use future value of an annuity toward a lump sum target:

- Monthly rate `r = (expectedAnnualReturnBps / 10000) / 12`
- Future value of current set-aside: `FV0 = setAsideCents * (1+r)^monthsRemaining`
- Remaining needed at end: `need = targetAmountCents - FV0`
- If `need <= 0`, status on-track with `requiredMonthlyCents = 0`
- Else payment: `PMT = need * r / ((1+r)^monthsRemaining - 1)` (if r≈0, fall back to flat division)

All money outputs rounded to cents.

### Status bands

Let `plannedMonthlyCents` be user-entered optional field on goal (`plannedMonthlyCents` in data model) or, if absent, compare to **trailing 3-month avg surplus** as proxy.

| Status | Condition |
|--------|-----------|
| `on_track` | `plannedMonthlyCents >= requiredMonthlyCents` OR (no planned and `avgMonthlySurplusCents >= requiredMonthlyCents`) |
| `tight` | planned/surplus ≥ 80% of required but &lt; required |
| `shortfall` | otherwise |

If `remainingCents === 0`, status `on_track`.

---

## Investor personality (self-assessment)

Five dimensions, each scored from quiz options. Store each answer; on submit compute scores and `label`.

### Questions (keys and options)

Each option carries a numeric contribution per dimension. Sum contributions, then normalize dimension to 0–100:

```
dimensionScore = round(100 * (raw - minRaw) / (maxRaw - minRaw))
```

Use fixed min/max per dimension from option design below so scores are stable.

**Q1 `risk_comfort`** (pick one)

| Option id | risk | liquidity |
|-----------|------|-----------|
| rc_1 | 10 | 30 |
| rc_2 | 30 | 25 |
| rc_3 | 55 | 15 |
| rc_4 | 75 | 10 |
| rc_5 | 90 | 5 |

**Q2 `time_horizon`** (years investing for long-term goals)

| Option id | horizon |
|-----------|---------|
| th_1 | 15 |
| th_2 | 35 |
| th_3 | 55 |
| th_4 | 75 |
| th_5 | 90 |

**Q3 `experience`**

| Option id | experience |
|-----------|------------|
| ex_1 | 10 |
| ex_2 | 30 |
| ex_3 | 55 |
| ex_4 | 75 |
| ex_5 | 90 |

**Q4 `loss_reaction`** (if portfolio −20% in a month)

| Option id | risk | liquidity |
|-----------|------|-----------|
| lr_1 | 5 | 40 |
| lr_2 | 20 | 30 |
| lr_3 | 45 | 20 |
| lr_4 | 65 | 15 |
| lr_5 | 85 | 10 |

**Q5 `liquidity_need`** (need cash within 12 months)

| Option id | liquidity |
|-----------|-----------|
| ln_1 | 90 |
| ln_2 | 70 |
| ln_3 | 45 |
| ln_4 | 25 |
| ln_5 | 10 |

**Composite risk score:**

```
riskScore = round(average(Q1.risk, Q4.risk))
horizonScore = Q2.horizon
experienceScore = Q3.experience
liquidityScore = round(average(Q1.liquidity, Q4.liquidity, Q5.liquidity))
```

**Label mapping** (evaluate in order):

1. If `liquidityScore >= 70` → `capital_preserver`
2. Else if `riskScore <= 35` → `conservative`
3. Else if `riskScore <= 55` and `horizonScore >= 50` → `balanced`
4. Else if `riskScore <= 75` and `experienceScore >= 40` → `growth`
5. Else if `riskScore > 75` and `experienceScore >= 55` → `aggressive`
6. Else → `balanced`

Labels (display strings):

| Label id | Title |
|----------|-------|
| `capital_preserver` | Capital Preserver |
| `conservative` | Conservative |
| `balanced` | Balanced |
| `growth` | Growth-Oriented |
| `aggressive` | Aggressive |

**Reveal rule:** UI shows quiz until all 5 answered; on submit, persist profile and set `personalityRevealedAt`; show reveal screen once; subsequent visits show profile summary unless user clicks Retake.

---

## Allocation bands (investment briefing)

Code selects a band from personality **label** (not from LLM). Percentages are targets for **long-term, non-emergency, non-near-term-goal** money.

Near-term goal rule: sum of `remainingCents` for goals with `short` bucket → treat as **cash-like** in briefing (not in equity band).

| Label | cash % | bonds % | equities % | other % |
|-------|--------|---------|------------|---------|
| capital_preserver | 50 | 35 | 10 | 5 |
| conservative | 35 | 40 | 20 | 5 |
| balanced | 15 | 35 | 45 | 5 |
| growth | 10 | 25 | 60 | 5 |
| aggressive | 5 | 15 | 75 | 5 |

**Priority order for narrative (fixed):**

1. If `gapCents > 0` → primary action: build emergency fund before increasing risk assets.
2. Allocate `shortGoalRemainingCents` mentally to cash (do not recommend equities for that portion).
3. Compare the user's **investable** mix to the band; report drift in percentage points, not trade orders.

**Current mix (investable):** multiply each included asset's latest value by its `sleevePercents`, then remove reserves before converting to percents:

1. Emergency reserve: from included **liquid** assets, cash sleeve first then bonds, equities, other, remove up to `min(eligibleCents, targetCents)`.
2. Short-term goals: from remaining cash sleeve, remove up to `shortGoalRemainingCents`.

Unfunded gaps are not invented as cash. Surplus cash above the emergency target stays in the mix.

Default sleeve percents when unset:

| Default sleeve | Asset types |
|----------------|-------------|
| cash 100% | `cash` |
| equities 100% | `brokerage`, `retirement` |
| other 100% | `crypto`, `real_estate`, `vehicle`, `business`, `receivable`, `other` |

Brokerage and retirement accounts can split across sleeves (for example 60% equities / 40% bonds) so bond exposure inside a fund is not forced into equities.

---

## Rule-based findings (detectors)

Each finding has `id`, `severity` (`info` | `warn`), and `data` object. Templates and AI consume the same list.

| Finding id | Trigger |
|------------|---------|
| `low_savings_rate` | Trailing 3m savings rate &lt; 10% and income &gt; 0 |
| `high_discretionary` | Discretionary spend &gt; 40% of expenses (non-essential / total) |
| `uncategorized_expenses` | &gt; 15% of expense count or amount uncategorized in trailing 3m |
| `emergency_fund_gap` | `gapCents > 0` |
| `emergency_fund_met` | `fundedRatio >= 1` |
| `goal_shortfall` | any goal status `shortfall` |
| `goal_tight` | any goal status `tight` |
| `negative_surplus` | trailing 3m surplus &lt; 0 |

---

## Category suggestion (non-AI fallback)

Keyword map on expense `note` + merchant-like first word (optional): e.g. "uber" → Transport. If no match, suggest most frequent category in last 90 days. If still none, leave uncategorized.

AI suggestion must return one of existing category ids or `null`—see [ai-contracts.md](ai-contracts.md).

---

## Versioning

When formulas change, bump `DOMAIN_VERSION` in code and `promptVersion` for AI tasks so cached results invalidate.
