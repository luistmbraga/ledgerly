import {
  allocateCapacity,
  computeGoalFeasibility,
  type GoalFeasibilityInput,
  type GoalStatus,
  type PortfolioVerdict,
} from "./goals";
import {
  SCENARIOS,
  computeRunway,
  projectEmergencyFundClose,
  projectNetWorth,
  stepBalance,
  type EmergencyFundCloseResult,
  type NetWorthMilestone,
  type RunwayResult,
  type ScenarioKey,
} from "./projection";

/**
 * What-if sandbox. Takes today's summary figures, applies hypothetical
 * adjustments and re-runs the existing calculators. Nothing here reads or
 * writes storage; the caller never persists a result.
 */

export const WHAT_IF_HORIZON_YEARS = [1, 3, 5, 10] as const;

/** A monthly change: a signed amount, or signed basis points of the current average. */
export type WhatIfChange =
  | { kind: "amount"; cents: number }
  | { kind: "percent"; bps: number };

export type WhatIfGoalInput = GoalFeasibilityInput & { id: number; name: string };

export type WhatIfDebt = {
  /** Current balance of the liability being overpaid. */
  balanceCents: number;
  extraMonthlyCents: number;
  /** User-entered for the scenario only; liabilities store no rate. */
  annualRateBps: number;
};

export type WhatIfBaseline = {
  asOf: string;
  netWorthCents: number;
  avgMonthlySurplusCents: number;
  /** Null when the trailing months are not fully journal-covered. Percent levers need these. */
  avgMonthlyIncomeCents: number | null;
  avgMonthlyExpenseCents: number | null;
  essentialMonthlyAverageCents: number;
  emergencyFund: { targetCents: number; eligibleCents: number };
  goals: readonly WhatIfGoalInput[];
};

export type WhatIfAdjustments = {
  income: WhatIfChange | null;
  spending: WhatIfChange | null;
  /** Windfall when positive, purchase when negative. Treated as liquid cash. */
  oneOffCents: number;
  debt: WhatIfDebt | null;
};

export const NO_ADJUSTMENTS: WhatIfAdjustments = {
  income: null,
  spending: null,
  oneOffCents: 0,
  debt: null,
};

/** Baseline figures after adjustments, plus the debt lever the simulation needs. */
export type WhatIfInputs = WhatIfBaseline & { debt: WhatIfDebt | null };

export type WhatIfGoalOutcome = {
  id: number;
  name: string;
  status: GoalStatus;
  requiredMonthlyCents: number;
  allocatedMonthlyCents: number;
};

export type WhatIfProjection = {
  key: ScenarioKey;
  label: string;
  returnBps: number;
  milestones: NetWorthMilestone[];
};

export type WhatIfDebtMilestone = {
  years: number;
  /** How much lower the debt is than it would otherwise be. Never above the balance. */
  reductionCents: number;
  extraPaidCents: number;
  interestAvoidedCents: number;
};

export type WhatIfOutcome = {
  netWorthCents: number;
  /** Surplus left to allocate each month, after any extra debt payment. */
  avgMonthlySurplusCents: number;
  /** (income − spending) / income. Null when the split is unknown or income is not positive. */
  savingsRate: number | null;
  emergencyFund: {
    eligibleCents: number;
    gapCents: number;
    /** Null when there is no gap, or when the surplus cannot close it. */
    close: EmergencyFundCloseResult | null;
  };
  goals: WhatIfGoalOutcome[];
  portfolioVerdict: PortfolioVerdict;
  projections: WhatIfProjection[];
  runway: RunwayResult | null;
  debt: WhatIfDebtMilestone[] | null;
};

export type WhatIfDiff = {
  netWorthCents: number;
  avgMonthlySurplusCents: number;
  savingsRate: number | null;
  emergencyFund: {
    eligibleCents: number;
    gapCents: number;
    /** Null when either side has no close date. */
    monthsToClose: number | null;
  };
  goals: Array<{
    id: number;
    from: GoalStatus;
    to: GoalStatus;
    statusChanged: boolean;
    allocatedMonthlyCents: number;
  }>;
  projections: Array<{ key: ScenarioKey; milestones: NetWorthMilestone[] }>;
  runwayMonths: number | null;
};

export type WhatIfResult = {
  baseline: WhatIfOutcome;
  scenario: WhatIfOutcome;
  diff: WhatIfDiff;
};

function validationError(message: string): Error {
  const error = new Error(message);
  error.name = "ValidationError";
  return error;
}

/** `amount × bps / 10000`, rounded half away from zero. */
function percentOf(amountCents: number, bps: number): number {
  const product = amountCents * bps;
  const rounded = Math.round(Math.abs(product) / 10_000);
  return product < 0 ? -rounded : rounded;
}

function resolveChange(
  change: WhatIfChange | null,
  averageCents: number | null,
  label: string,
): number {
  if (change === null) return 0;
  if (change.kind === "amount") return change.cents;
  if (averageCents === null) {
    throw validationError(
      `A percent ${label} change needs a known monthly ${label} average`,
    );
  }
  return percentOf(averageCents, change.bps);
}

export function isEmptyAdjustments(adjustments: WhatIfAdjustments): boolean {
  return (
    adjustments.income === null &&
    adjustments.spending === null &&
    adjustments.oneOffCents === 0 &&
    adjustments.debt === null
  );
}

/** Returns new inputs with the adjustments applied. Never mutates `baseline`. */
export function applyAdjustments(
  baseline: WhatIfBaseline,
  adjustments: WhatIfAdjustments,
): WhatIfInputs {
  const debt = adjustments.debt;
  if (debt !== null) {
    if (debt.extraMonthlyCents < 0) {
      throw validationError("extraMonthlyCents must be non-negative");
    }
    if (debt.annualRateBps < 0) {
      throw validationError("annualRateBps must be non-negative");
    }
    if (debt.balanceCents < 0) {
      throw validationError("balanceCents must be non-negative");
    }
  }

  const incomeDelta = resolveChange(
    adjustments.income,
    baseline.avgMonthlyIncomeCents,
    "income",
  );
  const spendingDelta = resolveChange(
    adjustments.spending,
    baseline.avgMonthlyExpenseCents,
    "spending",
  );

  return {
    asOf: baseline.asOf,
    netWorthCents: baseline.netWorthCents + adjustments.oneOffCents,
    avgMonthlySurplusCents:
      baseline.avgMonthlySurplusCents + incomeDelta - spendingDelta,
    avgMonthlyIncomeCents:
      baseline.avgMonthlyIncomeCents === null
        ? null
        : baseline.avgMonthlyIncomeCents + incomeDelta,
    avgMonthlyExpenseCents:
      baseline.avgMonthlyExpenseCents === null
        ? null
        : baseline.avgMonthlyExpenseCents + spendingDelta,
    essentialMonthlyAverageCents: baseline.essentialMonthlyAverageCents,
    emergencyFund: {
      targetCents: baseline.emergencyFund.targetCents,
      eligibleCents: Math.max(
        0,
        baseline.emergencyFund.eligibleCents + adjustments.oneOffCents,
      ),
    },
    goals: baseline.goals.map((goal) => ({ ...goal })),
    debt: debt === null ? null : { ...debt },
  };
}

function savingsRateOf(inputs: WhatIfInputs): number | null {
  const income = inputs.avgMonthlyIncomeCents;
  const expense = inputs.avgMonthlyExpenseCents;
  if (income === null || expense === null || income <= 0) return null;
  return (income - expense) / income;
}

/**
 * Month-by-month projection with an extra debt payment.
 *
 * `reduction` is how much lower the debt is than it would otherwise be. It
 * compounds at the debt rate (less principal means less interest) and is capped
 * at the current balance. Until the cap, the extra payment comes out of the
 * invested surplus; after it, the full surplus is invested again.
 * Net worth = invested balance + reduction.
 */
function simulateWithDebt(
  inputs: WhatIfInputs,
  debt: WhatIfDebt,
  returnBps: number,
): { milestones: NetWorthMilestone[]; debt: WhatIfDebtMilestone[] } {
  const investRate = returnBps / 10_000 / 12;
  const debtRate = debt.annualRateBps / 10_000 / 12;
  const maxMonths = Math.max(...WHAT_IF_HORIZON_YEARS) * 12;
  const targets = new Set<number>(WHAT_IF_HORIZON_YEARS.map((y) => y * 12));

  let balance = inputs.netWorthCents;
  let reduction = 0;
  let extraPaid = 0;
  const milestones: NetWorthMilestone[] = [];
  const debtMilestones: WhatIfDebtMilestone[] = [];

  for (let month = 1; month <= maxMonths; month++) {
    let payment = 0;
    if (reduction < debt.balanceCents) {
      const grown = Math.min(
        debt.balanceCents,
        Math.round(reduction * (1 + debtRate)),
      );
      payment = Math.min(debt.extraMonthlyCents, debt.balanceCents - grown);
      reduction = grown + payment;
      extraPaid += payment;
    }
    balance = stepBalance(
      balance,
      investRate,
      inputs.avgMonthlySurplusCents - payment,
    );

    if (targets.has(month)) {
      const years = month / 12;
      milestones.push({ years, netWorthCents: balance + reduction });
      debtMilestones.push({
        years,
        reductionCents: reduction,
        extraPaidCents: extraPaid,
        interestAvoidedCents: reduction - extraPaid,
      });
    }
  }

  return { milestones, debt: debtMilestones };
}

/** The only place outcomes are computed, so baseline and scenario share one code path. */
export function computeWhatIfOutcome(inputs: WhatIfInputs): WhatIfOutcome {
  const debt = inputs.debt;
  const freeSurplusCents =
    inputs.avgMonthlySurplusCents - (debt?.extraMonthlyCents ?? 0);

  const gapCents = Math.max(
    0,
    inputs.emergencyFund.targetCents - inputs.emergencyFund.eligibleCents,
  );

  const feasibilities = inputs.goals.map((goal) =>
    computeGoalFeasibility(goal, inputs.asOf, freeSurplusCents),
  );
  const capacity = allocateCapacity(
    inputs.goals.map((goal, i) => ({
      id: goal.id,
      fullMonthsUntilTarget: feasibilities[i].fullMonthsUntilTarget,
      requiredMonthlyCents: feasibilities[i].requiredMonthlyCents,
      remainingCents: feasibilities[i].remainingCents,
      plannedMonthlyCents: goal.plannedMonthlyCents,
    })),
    freeSurplusCents,
  );
  const capacityById = new Map(capacity.items.map((item) => [item.id, item]));

  let debtMilestones: WhatIfDebtMilestone[] | null = null;
  const projections: WhatIfProjection[] = SCENARIOS.map(
    ({ key, label, returnBps }) => {
      if (debt === null) {
        return {
          key,
          label,
          returnBps,
          milestones: projectNetWorth(
            inputs.netWorthCents,
            inputs.avgMonthlySurplusCents,
            returnBps,
            WHAT_IF_HORIZON_YEARS,
          ),
        };
      }
      const simulated = simulateWithDebt(inputs, debt, returnBps);
      // The debt path does not depend on the investment return.
      debtMilestones = simulated.debt;
      return { key, label, returnBps, milestones: simulated.milestones };
    },
  );

  return {
    netWorthCents: inputs.netWorthCents,
    avgMonthlySurplusCents: freeSurplusCents,
    savingsRate: savingsRateOf(inputs),
    emergencyFund: {
      eligibleCents: inputs.emergencyFund.eligibleCents,
      gapCents,
      close: projectEmergencyFundClose(gapCents, freeSurplusCents, inputs.asOf),
    },
    goals: inputs.goals.map((goal, i) => ({
      id: goal.id,
      name: goal.name,
      status: capacityById.get(goal.id)?.status ?? feasibilities[i].status,
      requiredMonthlyCents: feasibilities[i].requiredMonthlyCents,
      allocatedMonthlyCents: capacityById.get(goal.id)?.allocatedMonthlyCents ?? 0,
    })),
    portfolioVerdict: capacity.portfolioVerdict,
    projections,
    runway: computeRunway(
      inputs.netWorthCents,
      inputs.essentialMonthlyAverageCents,
    ),
    debt: debtMilestones,
  };
}

/** Scenario minus baseline, figure by figure. */
export function diffOutcomes(
  baseline: WhatIfOutcome,
  scenario: WhatIfOutcome,
): WhatIfDiff {
  const baseGoals = new Map(baseline.goals.map((goal) => [goal.id, goal]));
  const baseProjections = new Map(
    baseline.projections.map((projection) => [projection.key, projection]),
  );

  return {
    netWorthCents: scenario.netWorthCents - baseline.netWorthCents,
    avgMonthlySurplusCents:
      scenario.avgMonthlySurplusCents - baseline.avgMonthlySurplusCents,
    savingsRate:
      scenario.savingsRate === null || baseline.savingsRate === null
        ? null
        : scenario.savingsRate - baseline.savingsRate,
    emergencyFund: {
      eligibleCents:
        scenario.emergencyFund.eligibleCents - baseline.emergencyFund.eligibleCents,
      gapCents: scenario.emergencyFund.gapCents - baseline.emergencyFund.gapCents,
      monthsToClose:
        scenario.emergencyFund.close === null ||
        baseline.emergencyFund.close === null
          ? null
          : scenario.emergencyFund.close.monthsToClose -
            baseline.emergencyFund.close.monthsToClose,
    },
    goals: scenario.goals.map((goal) => {
      const before = baseGoals.get(goal.id);
      const from = before?.status ?? goal.status;
      return {
        id: goal.id,
        from,
        to: goal.status,
        statusChanged: from !== goal.status,
        allocatedMonthlyCents:
          goal.allocatedMonthlyCents - (before?.allocatedMonthlyCents ?? 0),
      };
    }),
    projections: scenario.projections.map((projection) => {
      const before = baseProjections.get(projection.key);
      return {
        key: projection.key,
        milestones: projection.milestones.map((milestone, i) => ({
          years: milestone.years,
          netWorthCents:
            milestone.netWorthCents - (before?.milestones[i]?.netWorthCents ?? 0),
        })),
      };
    }),
    runwayMonths:
      scenario.runway === null || baseline.runway === null
        ? null
        : scenario.runway.months - baseline.runway.months,
  };
}

export function runWhatIf(
  baseline: WhatIfBaseline,
  adjustments: WhatIfAdjustments,
): WhatIfResult {
  const baselineOutcome = computeWhatIfOutcome(
    applyAdjustments(baseline, NO_ADJUSTMENTS),
  );
  const scenarioOutcome = computeWhatIfOutcome(
    applyAdjustments(baseline, adjustments),
  );
  return {
    baseline: baselineOutcome,
    scenario: scenarioOutcome,
    diff: diffOutcomes(baselineOutcome, scenarioOutcome),
  };
}
