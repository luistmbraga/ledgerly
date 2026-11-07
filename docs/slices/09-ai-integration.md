# Slice 09 — AI integration

## Goal

OpenAI-compatible client; wire four tasks from [ai-contracts.md](../ai-contracts.md); cache in `ai_results`; fallbacks when key missing or errors.

## Depends on

Slice 08 (findings + partial snapshot), slice 07 (briefing gate), slice 06 (goal explain), slice 03 (category suggest).

## Domain rules

- `decision` object for briefing built in `domain/allocation.ts` using personality label bands [domain.md](../domain.md)
- Complete `buildFinancialSnapshot` including allocation current mix mapping

## In scope

### Database

- Table `ai_results`

### AI module

- `src/ai/client.ts` — env config, timeout, retry once
- JSON schema validation (zod) per task output
- Prompt files + version constants

### Task wiring

| Task | UI trigger |
|------|------------|
| `category_suggest` | Expense form "Suggest" |
| `tips` | Dashboard refresh tips (AI badge) |
| `goal_explain` | Goal detail "Explain" |
| `briefing` | `/briefing` full page with chart + disclaimer |

### Briefing page

- Build `decision` in code; pass to LLM; render sections
- Always show fixed disclaimer footer from ai-contracts
- Template briefing if no key

### Cache

- Hash input; reuse `ai_results` if hash + promptVersion match

### Domain (tests)

- `computeInvestableMix(assets, reserves)` → investable currentMixPercent after emergency and short-goal reserves
- `buildBriefingDecision(profile, emergency, goals, mix, shortGoalReserved)` → decision object

## Files allowed

```
src/ai/**
src/domain/allocation.ts, allocation.test.ts
src/domain/financial-snapshot.ts (complete)
src/db/repositories/ai-results.ts
src/app/briefing/page.tsx
src/app/goals/[id]/* (explain)
src/app/activity/* (suggest button)
```

## Out of scope

- Streaming responses
- Multiple LLM providers beyond OpenAI-compatible base URL
- Sending data to third parties besides configured API

## Acceptance checks

- [x] Without `AI_API_KEY`, all four surfaces use templates/fallback
- [x] With key, category suggest returns valid category id from list
- [x] Briefing refuses tickers in prompt test (mock response with AAPL → validator or post-check rejects)
- [x] Cached second call does not hit API (mock count)
- [x] `pnpm test` passes allocation + snapshot tests

## Notes

Add integration test with mocked fetch only; no real API key in CI.
