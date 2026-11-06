# Slice 05 — Emergency fund

## Goal

Emergency fund page with deterministic target, eligible balance, gap, and months-to-close from [domain.md](../domain.md).

## Depends on

Slices 02, 03.

## Domain rules

- Essential monthly average (3 months) or settings override
- Eligible = liquid assets latest snapshots
- Surplus average for months-to-close

## In scope

### Domain (tests required)

- `computeEssentialMonthlyAverage(expenses, categories, settings, asOfDate)`
- `computeEmergencyFund(...)` → target, eligible, gap, fundedRatio, monthsToCloseGap

### UI

- `/emergency-fund` per [ux.md](../ux.md)
- List contributing liquid assets with amounts
- Show whether essential spend uses override vs computed

### Dashboard hook

- Optional: small progress ring on dashboard using same service

## Files allowed

```
src/domain/emergency-fund.ts, emergency-fund.test.ts
src/services/emergency-fund-service.ts
src/app/emergency-fund/page.tsx
src/app/page.tsx (optional widget)
```

## Out of scope

- AI tips
- Non-liquid assets in eligible total unless user flagged liquid on asset

## Acceptance checks

- [x] Unit tests match domain doc examples (include fixture with 3 months essential expenses)
- [x] Mark asset liquid; its snapshot counts toward eligible
- [x] Override essential spend in settings changes target on page
- [x] gap=0 shows funded state
