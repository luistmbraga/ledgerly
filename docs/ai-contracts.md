# AI contracts

Ledgerly exposes **four** LLM tasks. The model receives **precomputed JSON** only; it must not introduce new numeric facts.

Global env: `AI_API_KEY`, optional `AI_BASE_URL` (default OpenAI), `AI_MODEL` (default `gpt-4o-mini`).

Global rules:

1. **Refusal:** If asked to recommend specific securities, predict returns, or give tax/legal advice, respond with JSON that sets `refused: true` and a short `reason` (still valid schema).
2. **Numbers:** Quote **display strings** from the input (formatted money and percents). Every number in output must appear in those quotable strings (or the expense note for category suggest). Do not invent figures.
3. **Language:** English.
4. **Tone:** Calm, educational, second person ("you").
5. **Length:** Respect max fields below (enforced in Zod; wire schema uses OpenAI strict mode without maxLength).
6. **Cache:** Store output in `ai_results` keyed by `task`, `entity_id`, `input_hash` (includes model id), `prompt_version`.

Prompt version constant per task: bump when instructions change.

---

## Task 1: `category_suggest`

**When:** User creates/edits expense with empty category (optional button "Suggest").

### Input

```json
{
  "task": "category_suggest",
  "promptVersion": "category_suggest_v2",
  "expense": {
    "note": "Uber airport"
  },
  "categories": [
    { "id": 4, "name": "Transport", "isEssential": false }
  ],
  "recentLabels": [
    { "notePrefix": "Uber", "categoryId": 4, "count": 5 }
  ]
}
```

Amount and date are omitted so they do not bias the label. Note truncated to 500 chars.

### Output schema

```json
{
  "type": "object",
  "required": ["categoryId", "confidence", "rationale", "refused", "reason"],
  "properties": {
    "categoryId": { "type": ["integer", "null"] },
    "confidence": { "type": "string", "enum": ["low", "medium", "high"] },
    "rationale": { "type": "string", "maxLength": 200 },
    "refused": { "type": "boolean" },
    "reason": { "type": "string", "maxLength": 200 }
  }
}
```

Per-request wire schema constrains `categoryId` to the ids in `categories` (plus null). Temperature `0`.

**UI:** Show suggestion; user must confirm before save. If `categoryId` null, show rationale only.

**Fallback without AI:** keyword + frequency map in domain.

---

## Task 2: `tips` (narrate findings)

**When:** Dashboard or dedicated Tips section refresh.

### Input

```json
{
  "task": "tips",
  "promptVersion": "tips_v2",
  "snapshot": {
    "currency": "EUR",
    "cashflow": {
      "trailingMonths": "3",
      "income": "€100.00",
      "expense": "€90.00",
      "surplus": "€10.00",
      "savingsRate": "10%",
      "essentialMonthlyAverage": "€30.00",
      "discretionaryShareOfExpenses": null,
      "uncategorizedExpenseShare": null
    },
    "emergencyFund": {
      "targetMonths": "6",
      "target": "€0.00",
      "eligible": "€0.00",
      "fundedRatio": "100%",
      "gap": "€0.00",
      "avgMonthlySurplus": "€0.00",
      "monthsToCloseGap": null
    },
    "findings": [
      {
        "id": "emergency_fund_met",
        "severity": "info",
        "gloss": "emergency fund meets its target",
        "data": { "fundedRatio": "100%", "currency": "EUR" }
      }
    ]
  }
}
```

Amounts and ratios are preformatted display strings. Finding ids include a short gloss.

### Output schema

```json
{
  "type": "object",
  "required": ["tips", "refused", "reason"],
  "properties": {
    "tips": {
      "type": "array",
      "maxItems": 6,
      "items": {
        "type": "object",
        "required": ["findingId", "title", "body"],
        "properties": {
          "findingId": { "type": "string" },
          "title": { "type": "string", "maxLength": 80 },
          "body": { "type": "string", "maxLength": 400 }
        }
      }
    },
    "refused": { "type": "boolean" },
    "reason": { "type": "string", "maxLength": 200 }
  }
}
```

**Rule:** One tip per finding id maximum; skip findings not present in input. Invalid tips (unknown id, duplicate, or invented numbers) are dropped; remaining tips are kept. If none remain, use templates.

**Fallback without AI:** template map:

| findingId | title template | body template |
|-----------|----------------|---------------|
| `low_savings_rate` | Low savings rate | Your savings rate is {savingsRate}% over the last 3 months. Consider reducing discretionary spend. |
| (etc.) | | Use `data` fields from finding |

---

## Task 3: `goal_explain`

**When:** Goal detail page load or "Explain" click.

### Input

```json
{
  "task": "goal_explain",
  "promptVersion": "goal_explain_v2",
  "goal": {
    "name": "House deposit",
    "bucket": "mid",
    "bucketGloss": "medium horizon",
    "targetAmount": "€50,000.00",
    "targetDate": "2028-06-01",
    "setAside": "€8,000.00",
    "remaining": "€42,000.00",
    "requiredMonthly": "€1,500.00",
    "status": "shortfall",
    "statusGloss": "current pace is behind the calculated monthly amount",
    "plannedMonthly": "€1,000.00",
    "expectedAnnualReturn": "3%"
  },
  "context": {
    "currency": "EUR",
    "avgMonthlySurplus": "€1,200.00"
  }
}
```

**Rule:** Do not change status or invent amounts; explain only. One repair call on schema/accept failure, then fallback.

---

## Task 4: `briefing` (investment)

**When:** Briefing page, only if `investorProfile` exists.

### Input

```json
{
  "task": "briefing",
  "promptVersion": "briefing_v2",
  "disclaimerRequired": true,
  "decision": {
    "priorities": [
      { "id": "build_emergency_fund", "gloss": "fill the emergency gap before adding risk" },
      { "id": "reserve_short_goals", "gloss": "keep short-horizon goal money in cash-like holdings" },
      { "id": "align_to_band", "gloss": "move the investable mix toward the profile band" }
    ],
    "targetBand": { "cash": "15%", "bonds": "35%", "equities": "45%", "other": "5%" },
    "currentMixPercent": { "cash": "40%", "bonds": "0%", "equities": "50%", "other": "10%" },
    "drift": { "cash": "25 pp", "bonds": "-35 pp", "equities": "5 pp", "other": "5 pp" },
    "emergencyGap": "€3,000.00",
    "emergencyReserved": "€2,000.00",
    "shortGoalRemaining": "€10,000.00",
    "shortGoalReserved": "€1,500.00",
    "profileLabel": "balanced",
    "profileTitle": "Balanced"
  },
  "snapshotNetWorth": "€250,000.00",
  "currency": "EUR"
}
```

`decision` object is built in code (`domain/allocation.ts` + briefing service)—**not** by LLM. One repair call on schema/accept/prohibited failure, then fallback.

### Output schema

```json
{
  "type": "object",
  "required": ["headline", "sections", "disclaimer", "refused", "reason"],
  "properties": {
    "headline": { "type": "string", "maxLength": 120 },
    "sections": {
      "type": "array",
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["heading", "body"],
        "properties": {
          "heading": { "type": "string", "maxLength": 60 },
          "body": { "type": "string", "maxLength": 600 }
        }
      }
    },
    "disclaimer": { "type": "string", "maxLength": 300 },
    "refused": { "type": "boolean" },
    "reason": { "type": "string", "maxLength": 200 }
  }
}
```

**Fixed disclaimer text (code must append even if model omits):**

"This is educational information based on your self-assessment and the data you entered. It is not investment advice or a recommendation to buy or sell any product."

**Prohibited in output:** ticker symbols, fund names, "guaranteed", "will return", tax instructions.

---

## System prompt skeleton (shared)

```
You are Ledgerly's assistant. You explain personal finance using ONLY the JSON provided.
Never invent amounts, rates, or products. Never recommend specific securities.
Respond with JSON matching the schema exactly.
```

Task-specific user message: `JSON.stringify(input)`.

Sampling: category suggest temperature `0`; narration tasks `0.2`. Strict JSON schema on the wire.

---

## Error handling

| Condition | Behavior |
|-----------|----------|
| Timeout / 429 / 5xx | Retry once; then fallback templates |
| 4xx (except 429) | Fail once; fallback (no retry) |
| Invalid JSON | Log; fallback |
| Schema validation fail | Briefing/goal: one repair call; then fallback. Category: fallback. |
| Invented numbers / prohibited briefing text | Briefing/goal: one repair call; then fallback. Tips: drop bad tips; fallback only if none remain. |
| `refused: true` | Show reason + fallback template for that task |

---

## Privacy

- Do not log full API responses in production console in slice 09 (dev OK).
- Truncate expense notes to 500 chars in input.

---

## Testing

- Mock LLM returns fixture JSON per task.
- Assert validator accepts display-string quotes (`€3,000.00`, `10%`) and rejects invented numbers.
- Assert partial tips keep valid items; 400 is not retried; model id affects cache key.
