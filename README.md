# Ledgerly

Personal finance web app for a single user: track net worth (assets and liabilities), income and expenses, emergency fund progress, financial goals, and a self-assessment investor profile. Rule-based calculators always run locally; optional AI narrates tips and briefings from numbers the app already computed.

**Status:** documentation-first. Application code is built slice by slice from [docs/roadmap.md](docs/roadmap.md).

## For humans

Once slice 01 is implemented, you will run:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Do not expose this app on the public internet until authentication exists (single-user localhost only).

Optional AI (OpenAI-compatible API):

```bash
export AI_API_KEY=...
export AI_BASE_URL=https://api.openai.com/v1   # optional
export AI_MODEL=gpt-4o-mini                    # optional
```

Without `AI_API_KEY`, categorization suggestions and AI-written tips/briefings fall back to templates and manual category choice.

SQLite database path: `data/ledgerly.db` (gitignored). Back up that file to preserve your data.

## For coding agents

1. Read [AGENTS.md](AGENTS.md).
2. Open [docs/roadmap.md](docs/roadmap.md) and implement **the next slice whose acceptance checks are not yet done** in the repo.
3. Follow [docs/slices/](docs/slices/) for that slice only. Do not invent scope (no bank sync, auth, multi-currency, double-entry, tax engine, or tickers unless a future slice explicitly adds them).
4. Domain rules live in [docs/domain.md](docs/domain.md). Data shape in [docs/data-model.md](docs/data-model.md). AI boundaries in [docs/ai-contracts.md](docs/ai-contracts.md).

## Documentation map

| Doc | Purpose |
|-----|---------|
| [docs/product.md](docs/product.md) | Product scope, glossary, locked decisions |
| [docs/domain.md](docs/domain.md) | Entities, invariants, formulas |
| [docs/data-model.md](docs/data-model.md) | SQLite tables and fields |
| [docs/architecture.md](docs/architecture.md) | Modules, flows, financial snapshot |
| [docs/ai-contracts.md](docs/ai-contracts.md) | Four AI tasks, JSON schemas, refusal rules |
| [docs/ux.md](docs/ux.md) | Screens and empty states |
| [docs/roadmap.md](docs/roadmap.md) | Slice order and dependencies |

## License

Private personal project unless you add a license file.
