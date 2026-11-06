# Slice 01 — App shell and settings

## Goal

Bootstrap the Ledgerly web app: Next.js App Router, TypeScript, Tailwind, SQLite + Drizzle, singleton settings, sidebar navigation shell, and settings page per [ux.md](../ux.md).

## Depends on

Nothing.

## Domain rules

- [data-model.md](../data-model.md) `settings` table
- [product.md](../product.md) single display currency, default EUR

## In scope

### Project setup

- `package.json` scripts: `dev`, `build`, `start`, `test`, `db:generate`, `db:migrate`
- Next.js 15+ App Router, TypeScript strict, Tailwind
- Vitest for unit tests
- `.gitignore`: `data/`, `.env`, `node_modules`, `.next`

### Database

- Drizzle schema for `settings`
- Migrations in `drizzle/`
- On first migrate/seed: insert settings row `id=1` with EUR, emergency months 6

### App shell

- Root layout with sidebar nav links (routes may 404 until later slices): Dashboard, Assets, Liabilities, Activity, Emergency fund, Goals, Personality, Briefing, Settings
- Simple page header + content area
- `/settings` form: display currency (text, 3 letters), emergency fund target months (integer 1–24), essential monthly spend override (optional money input → cents)

### Lib

- `formatMoney(cents, currency)` for display
- Parse decimal money input to cents with validation

## Files allowed (create/modify)

```
package.json, tsconfig.json, next.config.ts, tailwind.config.ts, postcss.config.mjs
.gitignore, .env.example
drizzle.config.ts, drizzle/*
src/db/schema.ts, src/db/client.ts, src/db/seed.ts
src/app/layout.tsx, src/app/page.tsx (placeholder dashboard)
src/app/settings/page.tsx
src/components/sidebar.tsx, src/components/money-input.tsx
src/lib/money.ts
```

## Out of scope

- Assets, journal, goals, personality, AI
- Authentication
- Production deployment config

## Acceptance checks

- [x] `pnpm install && pnpm db:migrate` creates `data/ledgerly.db` with settings row
- [x] `pnpm dev` serves localhost with sidebar and working `/settings` save
- [x] Settings persist after restart
- [x] `.env.example` documents optional AI vars (no key required)
- [x] `pnpm test` runs (even if zero tests initially)

## Notes for agent

Bind dev to `localhost` in docs/README only; use default Next dev behavior.
