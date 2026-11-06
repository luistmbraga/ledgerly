# AI contracts

Ledgerly exposes **four** LLM tasks. The model receives **precomputed JSON** only; it must not introduce new numeric facts.

Global env: `AI_API_KEY`, optional `AI_BASE_URL` (default OpenAI), `AI_MODEL` (default `gpt-4o-mini`).

Global rules:

1. **Refusal:** If asked to recommend specific securities, predict returns, or give tax/legal advice, respond with JSON that sets `refused: true` and a short `reason` (still valid schema).
2. **Numbers:** Every number in output must appear in input or be a non-financial count (e.g. bullet count).
3. **Language:** English.
4. **Tone:** Calm, educational, second person ("you").
5. **Length:** Respect max fields below.
6. **Cache:** Store output in `ai_results` keyed by `task`, `entity_id`, `input_hash`, `prompt_version`.

Prompt version constant per task: bump when instructions change.

---

## Task 1: `category_suggest`

**When:** User creates/edits expense with empty category (optional button "Suggest").

### Input

```json
{
  "task": "category_suggest",
  "promptVersion": "category_suggest_v1",
  "expense": {
    "id": 42,
    "amountCents": 1250,
    "occurredOn": "2026-03-01",
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

### Output schema

```json
{
  "type": "object",
  "required": ["categoryId", "confidence", "rationale"],
  "properties": {
    "categoryId": { "type": ["integer", "null"] },
    "confidence": { "type": "string", "enum": ["low", "medium", "high"] },
    "rationale": { "type": "string", "maxLength": 200 },
    "refused": { "type": "boolean" },
    "reason": { "type": "string", "maxLength": 200 }
  }
}
```

**UI:** Show suggestion; user must confirm before save. If `categoryId` null, show rationale only.

**Fallback without AI:** keyword + frequency map in domain.

---

## Task 2: `tips` (narrate findings)

**When:** Dashboard or dedicated Tips section refresh.

### Input

```json
{
  "task": "tips",
  "promptVersion": "tips_v1",
  "snapshot": { "...": "FinancialSnapshot subset: currency, cashflow, emergencyFund, findings only" }
}
```

Pass `snapshot.findings` fully; pass cashflow and emergency numbers from snapshot (already computed).

### Output schema

```json
{
  "type": "object",
  "required": ["tips"],
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

**Rule:** One tip per finding id maximum; skip findings not present in input.

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
  "promptVersion": "goal_explain_v1",
  "goal": {
    "id": 1,
    "name": "House deposit",
    "bucket": "mid",
    "targetAmountCents": 5000000,
    "targetDate": "2028-06-01",
    "setAsideCents": 800000,
    "remainingCents": 4200000,
    "requiredMonthlyCents": 150000,
    "status": "shortfall",
    "plannedMonthlyCents": 100000,
    "expectedAnnualReturnBps": 300
  },
  "context": {
    "currency": "EUR",
    "avgMonthlySurplusCents": 120000
  }
}
```

### Output schema

```json
{
  "type": "object",
  "required": ["summary", "steps"],
  "properties": {
    "summary": { "type": "string", "maxLength": 500 },
    "steps": {
      "type": "array",
      "maxItems": 5,
      "items": { "type": "string", "maxLength": 200 }
    },
    "refused": { "type": "boolean" },
    "reason": { "type": "string", "maxLength": 200 }
  }
}
```

**Rule:** Do not change `requiredMonthlyCents` or status; explain only.

---

## Task 4: `briefing` (investment)

**When:** Briefing page, only if `investorProfile` exists.

### Input

```json
{
  "task": "briefing",
  "promptVersion": "briefing_v1",
  "disclaimerRequired": true,
  "decision": {
    "priorities": [
      "build_emergency_fund",
      "reserve_short_goals",
      "align_to_band"
    ],
    "targetBand": { "cash": 15, "bonds": 35, "equities": 45, "other": 5 },
    "currentMixPercent": { "cash": 40, "bonds": 0, "equities": 50, "other": 10 },
    "drift": { "cash": 25, "bonds": -35, "equities": 5, "other": 5 },
    "emergencyGapCents": 300000,
    "shortGoalRemainingCents": 1000000,
    "profileLabel": "balanced",
    "profileTitle": "Balanced"
  },
  "snapshotNetWorthCents": 25000000,
  "currency": "EUR"
}
```

`decision` object is built in code (`domain/allocation.ts` + briefing service)—**not** by LLM.

### Output schema

```json
{
  "type": "object",
  "required": ["headline", "sections", "disclaimer"],
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

---

## Error handling

| Condition | Behavior |
|-----------|----------|
| HTTP error / timeout | Retry once; then fallback templates |
| Invalid JSON | Log; fallback |
| Schema validation fail | Discard; fallback |
| `refused: true` | Show reason + fallback template for that task |

---

## Privacy

- Do not log full API responses in production console in slice 09 (dev OK).
- Truncate expense notes to 500 chars in input.

---

## Testing

- Mock LLM returns fixture JSON per task.
- Assert validator rejects output with extra numeric claims (spot check tests).
