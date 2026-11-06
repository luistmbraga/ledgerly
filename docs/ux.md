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
| `/assets` | Assets list + detail |
| `/liabilities` | Liabilities list + detail |
| `/activity` | Tabs: Expenses, Income, Invoices |
| `/emergency-fund` | Emergency fund |
| `/goals` | Goals list |
| `/goals/[id]` | Goal detail |
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
- Flags: Liquid (emergency fund), Include in allocation
- Edit name/type, delete asset

**Empty list:** Explain that snapshots drive net worth.

---

## Liabilities `/liabilities`

Mirror assets pattern without liquid/allocation flags.

---

## Activity `/activity`

Tab **Expenses**

- Table: date, category, amount, note
- Add/edit expense; category dropdown; optional "Suggest category" (slice 09)
- Highlight uncategorized rows

Tab **Income**

- Same pattern with income categories

Tab **Invoices**

- Table: direction, counterparty, due date, amount, status
- Add invoice; actions: Mark paid, Cancel
- Mark paid: confirm; create linked income (receivable) or expense (payable) with prefilled amount/date

**Empty tabs:** Short explanation + add button.

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
| Invoice paid | "This will record an income/expense entry for today. You can edit the date in Activity." |

---

## Related

- [product.md](product.md)
- [architecture.md](architecture.md)
