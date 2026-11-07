# Slice 02 — Assets, liabilities, net worth

## Goal

User can manage assets and liabilities with value snapshot history; dashboard shows net worth and breakdown per [domain.md](../domain.md).

## Depends on

Slice 01.

## Domain rules

- Net worth formulas in [domain.md](../domain.md)
- Asset/liability enums in [product.md](../product.md)
- Tables: `assets`, `liabilities`, `value_snapshots` in [data-model.md](../data-model.md)

## In scope

### Domain (with tests)

- `computeNetWorth(assetsWithLatest, liabilitiesWithLatest)` → totals + byAssetType map
- Latest snapshot selection (date, then id)

### Repositories

- CRUD assets, liabilities
- Add/list snapshots for each

### UI

- `/assets` list + `/assets/[id]` detail (snapshots, flags `isLiquid`, `includeInAllocation`)
- `/liabilities` list + `/liabilities/[id]` detail (no liquid flags)
- Dashboard `/`: net worth headline, assets vs liabilities, breakdown by asset type (zero OK)

### Validation

- Snapshot amount ≥ 0
- Asset type enum enforced

## Files allowed

```
src/domain/net-worth.ts, src/domain/net-worth.test.ts
src/db/schema.ts (extend), drizzle migration
src/db/repositories/assets.ts, liabilities.ts, snapshots.ts
src/app/assets/**, src/app/liabilities/**
src/app/page.tsx (dashboard net worth)
src/services/dashboard-summary.ts (optional)
```

## Out of scope

- Linking journal to balances
- Charts beyond simple bars/lists
- Receivable assets auto-sync

## Acceptance checks

- [x] Create asset, add two snapshots; UI shows latest as current value
- [x] Create liability; net worth = assets − liabilities on dashboard
- [x] Unit tests cover net worth and latest snapshot tie-break
- [x] Delete asset removes snapshots

## Notes

Receivable **asset type** is manual tracking only in v1.

