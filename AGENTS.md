# Agent instructions (Ledgerly)

You are implementing **Ledgerly**, a single-user personal finance web app. Product and scope are already decided. Your job is to execute **one roadmap slice at a time** without expanding scope.

## Before you write code

1. Read the slice file under `docs/slices/` (e.g. `03-expenses-income.md`).
2. Skim [docs/domain.md](docs/domain.md) for invariants and formulas that slice touches.
3. Skim [docs/data-model.md](docs/data-model.md) for tables you may add or use.
4. If the slice mentions UI, follow [docs/ux.md](docs/ux.md) for screen names and empty states.

## Scope locks (do not violate)

| Rule | Meaning |
|------|---------|
| Single user | No signup, login, roles, or tenant IDs. |
| Localhost | Bind dev server to localhost; docs assume no public deployment. |
| Manual data | No bank/broker APIs, CSV import, or automatic balance sync unless a slice adds it. |
| Net worth | Latest **value snapshot** per asset/liability is current value. Journal entries do not auto-adjust balances. |
| No double-entry | v1 does not reconcile cashflow journal to balance changes. |
| Money | Store amounts as **integer cents** in one **display currency** from settings (default EUR). No FX. |
| AI is narration | LLM must not compute money, returns, tax, or legal outcomes. Calculators and detectors run in TypeScript first; AI only formats/suggests from provided JSON. |
| Investment output | Educational allocation bands only. No ticker symbols, no "buy X", no guaranteed returns. Disclaimer on briefing UI. |
| English UI | User-visible strings in English. |

## Implementation conventions (once stack exists)

- **Stack:** Next.js App Router, TypeScript, Tailwind, Drizzle + SQLite at `data/ledgerly.db`.
- **Domain logic:** Pure functions in `src/domain/` (or equivalent) with unit tests. Tests are the source of truth for calculator behavior.
- **Server actions / route handlers:** Validate input, call domain + DB, return typed results.
- **Do not** add a heavy UI kit unless a slice requires it; use small local components.
- **Do not** commit secrets or `data/ledgerly.db`.

## Slice workflow

1. Implement only what the slice lists under "In scope".
2. Run tests and dev server; fix until acceptance checks pass.
3. Do not start the next slice in the same PR/session unless the user asked for multiple slices.
4. Mark acceptance items in the slice file or leave a short note in the commit message—do not edit [docs/roadmap.md](docs/roadmap.md) to check off slices unless the user wants that.

## When unsure

- Prefer the **domain doc** over your intuition for formulas.
- Prefer **deterministic code** over prompting the model for numbers.
- If the slice is silent on a feature, it is **out of scope**.

## Files you must not treat as product spec

- `.cursor/plans/*` — planning artifacts; [docs/product.md](docs/product.md) and slices are authoritative.
