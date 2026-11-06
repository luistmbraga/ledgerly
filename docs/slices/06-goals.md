# Slice 06 — Goals

## Goal

CRUD financial goals with feasibility status and required monthly contribution per [domain.md](../domain.md).

## Depends on

Slice 03 (uses avg surplus from cashflow); slice 05 optional for dashboard.

## Domain rules

- Horizon buckets from target date
- `requiredMonthlyCents`, status on_track/tight/shortfall
- Optional return bps annuity formula

## In scope

### Database

- Table `goals`

### Domain (tests required)

- `computeGoalFeasibility(goal, asOfDate, avgMonthlySurplusCents)`
- Bucket derivation

### UI

- `/goals` list, create form
- `/goals/[id]` detail with status chip, required monthly, planned vs required
- Template explanation paragraph (static strings, not AI yet)

### Dashboard

- Show up to 3 goals summary on `/`

## Files allowed

```
src/domain/goals.ts, goals.test.ts
src/db/repositories/goals.ts
src/app/goals/**
```

## Out of scope

- AI goal_explain
- Linking set_aside to specific asset accounts

## Acceptance checks

- [x] Unit tests for flat monthly and one return case
- [x] Shortfall when planned monthly below required
- [x] on_track when set_aside equals target
- [x] Bucket badge correct for dates 6mo / 3yr / 10yr
