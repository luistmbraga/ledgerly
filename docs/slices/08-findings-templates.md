# Slice 08 — Findings and template tips

## Goal

Rule-based findings from [domain.md](../domain.md); dashboard Tips panel using template text (no LLM).

## Depends on

Slices 05, 06, 07 (profile optional for findings), 03 for cashflow.

## Domain rules

- Finding ids and triggers [domain.md](../domain.md)
- Template map referenced in [ai-contracts.md](../ai-contracts.md) fallback section

## In scope

### Domain (tests)

- `buildFindings(snapshotInputs)` → array of `{ id, severity, data }`
- `renderTipTemplates(findings)` → `{ findingId, title, body }[]`

### Financial snapshot builder (partial)

- Implement `buildFinancialSnapshot` fields needed for findings: net worth summary, cashflow trailing 3m, emergency fund block, goals statuses
- Full allocation block may be stubbed with zeros until briefing slice 09

### UI

- Dashboard Tips panel listing template cards
- Badge "Template" on each card

## Files allowed

```
src/domain/findings.ts, findings.test.ts
src/domain/financial-snapshot.ts (partial)
src/services/tips-service.ts
src/app/page.tsx
```

## Out of scope

- OpenAI calls
- Briefing page content beyond gate from slice 07

## Acceptance checks

- [ ] Low savings rate finding fires when surplus/income &lt; 10% in fixture
- [ ] emergency_fund_gap fires when gap &gt; 0
- [ ] goal_shortfall when any goal shortfall
- [ ] Dashboard shows at least one template when triggers met
- [ ] No API key required
