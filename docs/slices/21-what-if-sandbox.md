# Slice 21 — What-if sandbox

## Goal

Let the user perturb today's figures ("salary +10%", "cut spending 10%", "overpay the mortgage by €200") and see how surplus, emergency fund, goals, projected net worth and runway would differ. Scenarios are hypothetical: nothing is saved and every hypothetical figure is visibly marked.

## In scope

- Pure module `src/domain/scenario.ts`: `applyAdjustments`, `computeWhatIfOutcome`, `diffOutcomes`, `runWhatIf`. Baseline and scenario outcomes come from the same function, reusing `computeGoalFeasibility`, `allocateCapacity`, `projectNetWorth`, `projectEmergencyFundClose` and `computeRunway`.
- Four levers:
  - Monthly income change (signed amount, or percent).
  - Monthly spending change (signed amount, or percent). Moves surplus only; essential spend, the emergency-fund target and runway keep today's essential spend.
  - One-off amount (windfall positive, purchase negative). Shifts net worth and liquid emergency-fund cash (floored at 0).
  - Extra monthly debt payment: liability, amount and an annual rate typed into the form. The rate is not stored. Output is an estimated interest avoided, capped at the liability's current balance.
- Percent mode for income and spending only when the trailing 3-month income/expense averages are known (all three months covered by the journal). Otherwise amounts only.
- New read-only screen `/what-if` ("What-if" in the nav). State lives in URL query parameters through a plain GET form. No server action, no table, no AI.
- `ScenarioFigure` is the only component that renders a hypothetical value; it always carries a "What-if" marker.
- `stepBalance` extracted from `projectNetWorth` so the per-month projection formula has one definition. No behaviour change.
- `docs/ux.md` and `docs/domain.md` updated.

## Out of scope

- Saved or named scenarios; comparing several scenarios side by side.
- Re-running findings, allocation bands or the briefing under a scenario.
- AI narration of scenarios.
- Storing an interest rate or term on liabilities; debt payoff dates. (Slice 22 later added an optional stored rate; terms and payoff dates stay out of scope.)
- Inflation or tax modelling.
- Changing essential spend or the emergency-fund target.

## Acceptance

- Loading `/what-if` with any parameters leaves the database unchanged.
- No parameters: only current figures are shown, with no deltas.
- The same URL on the same day gives the same figures.
- Every hypothetical figure is rendered by `ScenarioFigure` with its marker.
- Percent levers are unavailable when the income/expense split is unknown.
- A scenario with a non-positive surplus says the fund is not on a closing path instead of showing a date.
- An extra debt payment of zero gives the same projection as the Projection screen.
