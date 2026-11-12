# UX specification

Desktop-first responsive layout. Primary navigation: persistent sidebar (collapse to icons on narrow viewports).

**Currency display:** format cents with user `displayCurrency` (e.g. €1,234.56).

**After actions:** show toast + refresh visible totals (net worth, fund %, goal status) on the same or redirected page.

---

## Global patterns

| Pattern | Behavior |
|---------|----------|
| Empty state | Illustration optional; one sentence + primary CTA |
| Lists | Sort by date desc for journal; by name for assets |
| Forms | Inline validation; amounts as decimal input converted to cents server-side |
| Destructive | Confirm modal for delete |
| AI badge | "AI" pill when text came from model; "Template" when fallback |

---

## Navigation map

| Route | Screen |
|-------|--------|
| `/` | Dashboard |
| `/update` | Monthly update balances |
| `/assets` | Assets list + detail |
| `/liabilities` | Liabilities list + detail |
| `/activity` | Tabs: Expenses, Income |
| `/emergency-fund` | Emergency fund |
| `/goals` | Goals list |
| `/goals/[id]` | Goal detail |
| `/projection` | Projection |
| `/what-if` | What-if sandbox (slice 21) |
| `/personality` | Quiz or profile |
| `/briefing` | Investment briefing |
| `/settings` | Settings |

---

## Dashboard `/`

**Shows:**

- Net worth headline + assets / liabilities breakdown (mini bars)
- Trailing 3-month income, expenses, surplus, savings rate
- Emergency fund progress ring (funded %)
- Goals at a glance (up to 3, link to rest)
- **Tips** panel: findings as cards (template or AI narrated)
- Quick actions: Add expense, Update balance, Add goal

**Empty:** No assets yet → CTA "Add your first asset" and hide net worth breakdown.

---

## Assets `/assets`

**List:** name, type, latest value, last updated date.

**Actions:** Add asset, open detail.

**Detail `/assets/[id]`:**

- Current value (from latest snapshot)
- Snapshot history table
- Form: new snapshot (date, amount, note)
- Flags: Liquid (emergency fund), Count in investment mix
- Edit name/type, delete asset

**Empty list:** Explain that snapshots drive net worth.

---

## Liabilities `/liabilities`

Mirror assets pattern without liquid/allocation flags.

---

## Activity `/activity`

Tab **Expenses**

- Table: date, category, amount, cash account, note
- Add/edit expense; category dropdown; optional cash account (cash assets only); optional "Suggest category" (slice 09)
- Highlight uncategorized rows

Tab **Income**

- Same pattern with income categories and optional cash account

Tab **Recurring** (slice 14)

- "Due to post" review list: checkbox and editable amount per due occurrence → **Post selected**
- Template list (description, amount, repeats, next date, cash account) with edit / pause / delete
- "Suggested from your history" (slice 17, collapsed): monthly patterns found in the journal with evidence, editable description/amount/category, unticked by default → **Create selected templates**; each starts at its next expected date
- Other tabs show a banner "N recurring entries are due" linking here

Header link **Import statement** → `/activity/import`.

**Empty tabs:** Short explanation + add button.

---

## Import statement `/activity/import` (slice 15)

- Upload a PDF (CGD "Consultar saldos e movimentos" ActivoBank "Extrato Combinado", slice 16, or Trade Republic "Account statement", slice 19), optional cash account, and how to update its balance: closing balance (default), after every row, or not at all
- Preview: parser notes (e.g. extra account sections ignored), reconciliation note, balance note, totals, then every row with include checkbox, date, editable note, amount, category, and a check column for flags/issues
- Flagged rows (already imported, recurring, possible duplicate, own transfer, investment trade, cancels out) start unticked; rows with issues cannot be selected
- An "Investment trade" row has a **Split off a fee** field: entering a fee below the trade amount ticks the row and imports only the fee as an expense (note "Fee: …"); clearing it puts the row back as the unticked trade. An invalid fee blocks import (slice 20)
- A "Recurring" row whose amount or date differs offers **Update the posted entry to …** (ticked by default; disabled when that entry's cash link is frozen). Recurring matches allow ±5 days across a month boundary (slice 18)
- **Import N rows** writes everything in one go or nothing; errors name the row
- Recent imports list with **Undo**

**Errors:** unsupported format, scanned PDF, password-protected PDF, file over 5 MB, non-EUR statement — each as a plain message above the upload button.

---

## Emergency fund `/emergency-fund`

**Shows:**

- Target months (link to settings) × essential monthly spend = target amount
- Essential spend source: computed vs override (label which)
- Eligible liquid assets total
- Progress bar, gap, months to close gap (if surplus &gt; 0)
- List liquid assets contributing

**Empty:** No liquid assets → CTA mark cash accounts as liquid or add cash asset.

---

## What-if `/what-if` (slice 21)

Read-only sandbox. Nothing on this screen is saved.

**Form (GET, state in the URL):**

- Monthly income change and monthly spending change: signed amount per month, or percent when three full journal months exist
- One-off amount: plus for a windfall, minus for a purchase
- Extra debt payment: liability, extra per month, annual interest rate (typed for the what-if only)
- "Run what-if" and "Reset"

**Shows:** current figure next to the what-if figure for surplus left to allocate, savings rate, net worth today, emergency fund gap and close date, each goal's status, the net worth projection table (same horizons and return assumptions as Projection), estimated interest avoided, and runway.

**Marker rule:** every what-if figure is rendered by `ScenarioFigure` (amber dashed box with a "What-if" tag). A persistent note at the top says the screen is hypothetical.

**Empty and error states:** no changes entered → current figures only. Invalid field → inline message, typed text kept, current figures only. No liabilities with a balance → debt lever hidden. No goals → goals block hidden.

---

## Goals `/goals`

**List:** name, bucket badge, target date, progress bar (set aside / target), status chip.

**Add goal form:** name, target amount, target date, set aside, optional planned monthly, optional expected return %.

**Detail `/goals/[id]`:**

- Status, required monthly (large)
- Comparison to planned monthly and avg surplus
- Explanation block (template or AI)
- Edit / delete

**Empty:** Examples of short/mid/long goals as hint text.

---

## Personality `/personality`

### State A — not complete

- Progress indicator (5 steps)
- One question per screen or single scroll form
- Submit disabled until all answered
- Copy: self-assessment disclaimer

### State B — reveal (first time after submit)

- Full-screen or modal **reveal** with profile title (e.g. "Balanced")
- Dimension bars (risk, horizon, experience, liquidity)
- Button: "Continue to dashboard" or "View briefing"

### State C — profile exists

- Show stored profile summary
- Actions: Retake quiz (confirm replaces profile)

**Gate:** Briefing nav item disabled or tooltip until profile complete.

---

## Briefing `/briefing`

**Requires:** investor profile exists.

**Shows:**

- Headline + sections (from AI or template from `decision`)
- Target allocation vs current mix (bar chart, percentages from code)
- Full personality allocation band table (all five labels; saved profile row highlighted)
- Priority callouts: emergency gap, short goals
- **Disclaimer** always visible at bottom (fixed text from ai-contracts)

**If emergency fund gap &gt; 0:** banner "Build emergency fund first" above allocation chart.

**Empty profile:** Redirect to `/personality`.

---

## Settings `/settings`

- Display currency (warn: does not convert existing amounts)
- Emergency fund target months
- Essential monthly spend override (optional cents field)
- AI status: configured / not configured (no key shown)
- Data path hint: `data/ledgerly.db`

---

## Component notes (implementation)

- Use accessible form labels and focus states.
- Charts: simple CSS bars for v1 (no chart library required unless slice adds recharts).
- Sidebar active state matches route prefix.

---

## Copy snippets (English)

| Location | Text |
|----------|------|
| Personality disclaimer | "This quiz is a self-assessment for educational purposes. It is not a psychological or regulatory suitability test." |
| Briefing gate | "Complete the investor personality quiz to unlock your briefing." |

---

## Related

- [product.md](product.md)
- [architecture.md](architecture.md)
