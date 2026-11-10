import type { GoalStatus } from "./goals";
import type { BudgetStatus } from "./budgets";
import { ratio } from "./cashflow";
import { ALLOCATION_SLEEVES, type AllocationPercents } from "./allocation";
import { isoDateToDayNumber } from "../lib/dates";
import { formatMoney } from "../lib/money";
import { formatRatio } from "../lib/percent";

export type FindingSeverity = "info" | "warn";

export type FindingData = Record<string, number | string | boolean | null | undefined>;

export type Finding = {
  id: string;
  severity: FindingSeverity;
  data: FindingData;
};

export type TipTemplate = {
  findingId: string;
  title: string;
  body: string;
};

/** Numbers the detectors read. Ratios are derived here from these cents and counts. */
export type FindingsInput = {
  currency: string;
  incomeCents: number;
  surplusCents: number;
  savingsRate: number | null;
  expenseCents: number;
  discretionaryCents: number;
  expenseCount: number;
  uncategorizedExpenseCount: number;
  uncategorizedExpenseAmountCents: number;
  gapCents: number;
  fundedRatio: number | null;
  goals: ReadonlyArray<{ name: string; status: GoalStatus }>;
  /** Balance-sheet fields for journal-free detectors (all optional). */
  totalAssetsCents?: number;
  totalLiabilitiesCents?: number;
  cashAssetsCents?: number;
  currentMix?: AllocationPercents | null;
  /** Target band from investor profile. Null = no profile set. */
  targetBand?: AllocationPercents | null;
  assetSnapshots?: ReadonlyArray<{ name: string; latestRecordedOn: string | null }>;
  asOf?: string;
  budgetStatuses?: ReadonlyArray<BudgetStatus>;
};

const LOW_SAVINGS_RATE = 0.1;
const HIGH_DISCRETIONARY_SHARE = 0.4;
const UNCATEGORIZED_SHARE = 0.15;
const ALLOCATION_DRIFT_PP = 10;
const CASH_CONCENTRATION_RATIO = 0.6;
const LIABILITY_RATIO_THRESHOLD = 0.5;
const STALE_SNAPSHOT_DAYS = 90;

function goalsWithStatus(input: FindingsInput, status: GoalStatus): string[] {
  return input.goals
    .filter((goal) => goal.status === status)
    .map((goal) => goal.name);
}

export function buildFindings(snapshotInputs: FindingsInput): Finding[] {
  const { savingsRate } = snapshotInputs;
  const discretionaryShare = ratio(
    snapshotInputs.discretionaryCents,
    snapshotInputs.expenseCents,
  );
  const uncategorizedCountShare = ratio(
    snapshotInputs.uncategorizedExpenseCount,
    snapshotInputs.expenseCount,
  );
  const uncategorizedAmountShare = ratio(
    snapshotInputs.uncategorizedExpenseAmountCents,
    snapshotInputs.expenseCents,
  );

  const findings: Finding[] = [];

  if (savingsRate !== null && savingsRate < LOW_SAVINGS_RATE) {
    findings.push({
      id: "low_savings_rate",
      severity: "warn",
      data: {
        savingsRate,
        incomeCents: snapshotInputs.incomeCents,
        surplusCents: snapshotInputs.surplusCents,
      },
    });
  }

  if (
    discretionaryShare !== null &&
    discretionaryShare > HIGH_DISCRETIONARY_SHARE
  ) {
    findings.push({
      id: "high_discretionary",
      severity: "warn",
      data: {
        discretionaryShare,
        discretionaryCents: snapshotInputs.discretionaryCents,
        expenseCents: snapshotInputs.expenseCents,
      },
    });
  }

  if (
    (uncategorizedCountShare !== null &&
      uncategorizedCountShare > UNCATEGORIZED_SHARE) ||
    (uncategorizedAmountShare !== null &&
      uncategorizedAmountShare > UNCATEGORIZED_SHARE)
  ) {
    findings.push({
      id: "uncategorized_expenses",
      severity: "warn",
      data: {
        uncategorizedCountShare,
        uncategorizedAmountShare,
        uncategorizedExpenseCount: snapshotInputs.uncategorizedExpenseCount,
        expenseCount: snapshotInputs.expenseCount,
        uncategorizedExpenseAmountCents:
          snapshotInputs.uncategorizedExpenseAmountCents,
        expenseCents: snapshotInputs.expenseCents,
      },
    });
  }

  if (snapshotInputs.gapCents > 0) {
    findings.push({
      id: "emergency_fund_gap",
      severity: "warn",
      data: {
        gapCents: snapshotInputs.gapCents,
        fundedRatio: snapshotInputs.fundedRatio,
        currency: snapshotInputs.currency,
      },
    });
  }

  if (
    snapshotInputs.gapCents <= 0 &&
    snapshotInputs.fundedRatio !== null &&
    snapshotInputs.fundedRatio >= 1
  ) {
    findings.push({
      id: "emergency_fund_met",
      severity: "info",
      data: {
        fundedRatio: snapshotInputs.fundedRatio,
        currency: snapshotInputs.currency,
      },
    });
  }

  const shortfallNames = goalsWithStatus(snapshotInputs, "shortfall");
  if (shortfallNames.length > 0) {
    findings.push({
      id: "goal_shortfall",
      severity: "warn",
      data: {
        goalCount: shortfallNames.length,
        goalNames: shortfallNames.join(", "),
      },
    });
  }

  const tightNames = goalsWithStatus(snapshotInputs, "tight");
  if (tightNames.length > 0) {
    findings.push({
      id: "goal_tight",
      severity: "warn",
      data: {
        goalCount: tightNames.length,
        goalNames: tightNames.join(", "),
      },
    });
  }

  if (snapshotInputs.surplusCents < 0) {
    findings.push({
      id: "negative_surplus",
      severity: "warn",
      data: {
        surplusCents: snapshotInputs.surplusCents,
        deficitCents: -snapshotInputs.surplusCents,
        currency: snapshotInputs.currency,
      },
    });
  }

  // Balance-sheet detectors — fire without any journal entries.

  const { currentMix, targetBand } = snapshotInputs;

  if (currentMix != null && targetBand != null) {
    let maxDrift = 0;
    let worstSleeve: string = "cash";
    for (const sleeve of ALLOCATION_SLEEVES) {
      const drift = Math.abs(currentMix[sleeve] - targetBand[sleeve]);
      if (drift > maxDrift) {
        maxDrift = drift;
        worstSleeve = sleeve;
      }
    }
    if (maxDrift > ALLOCATION_DRIFT_PP) {
      findings.push({
        id: "allocation_drift",
        severity: "warn",
        data: {
          sleeve: worstSleeve,
          driftPp: maxDrift,
          currentPct: currentMix[worstSleeve as keyof AllocationPercents],
          targetPct: targetBand[worstSleeve as keyof AllocationPercents],
        },
      });
    }
  }

  const { totalAssetsCents, totalLiabilitiesCents, cashAssetsCents } = snapshotInputs;

  if (targetBand == null && cashAssetsCents !== undefined && totalAssetsCents) {
    const cashRatio = ratio(cashAssetsCents, totalAssetsCents);
    if (cashRatio !== null && cashRatio > CASH_CONCENTRATION_RATIO) {
      findings.push({
        id: "cash_concentration",
        severity: "warn",
        data: {
          cashRatio,
          cashAssetsCents,
          currency: snapshotInputs.currency,
        },
      });
    }
  }

  if (totalAssetsCents && totalLiabilitiesCents !== undefined) {
    const lRatio = ratio(totalLiabilitiesCents, totalAssetsCents);
    if (lRatio !== null && lRatio > LIABILITY_RATIO_THRESHOLD) {
      findings.push({
        id: "liability_ratio",
        severity: "warn",
        data: {
          liabilityRatio: lRatio,
          totalLiabilitiesCents,
          totalAssetsCents,
          currency: snapshotInputs.currency,
        },
      });
    }
  }

  if (snapshotInputs.assetSnapshots && snapshotInputs.asOf) {
    const asOfDay = isoDateToDayNumber(snapshotInputs.asOf);
    const staleNames: string[] = [];
    for (const asset of snapshotInputs.assetSnapshots) {
      if (!asset.latestRecordedOn) {
        staleNames.push(asset.name);
      } else {
        const day = isoDateToDayNumber(asset.latestRecordedOn);
        if (asOfDay !== null && day !== null && asOfDay - day > STALE_SNAPSHOT_DAYS) {
          staleNames.push(asset.name);
        }
      }
    }
    if (staleNames.length > 0) {
      findings.push({
        id: "stale_snapshots",
        severity: "warn",
        data: {
          count: staleNames.length,
          names: staleNames.join(", "),
        },
      });
    }
  }

  if (snapshotInputs.budgetStatuses) {
    const over = snapshotInputs.budgetStatuses.filter((s) => s.status === "over");
    if (over.length > 0) {
      findings.push({
        id: "overspend_budget",
        severity: "warn",
        data: {
          count: over.length,
          names: over.map((s) => s.categoryName).join(", "),
          currency: snapshotInputs.currency,
        },
      });
    }
    const warning = snapshotInputs.budgetStatuses.filter((s) => s.status === "warning");
    if (warning.length > 0) {
      findings.push({
        id: "budget_warning",
        severity: "info",
        data: {
          count: warning.length,
          names: warning.map((s) => s.categoryName).join(", "),
          currency: snapshotInputs.currency,
        },
      });
    }
  }

  return findings;
}

function percentText(value: number | string | boolean | null | undefined): string {
  if (typeof value !== "number") return "n/a";
  return formatRatio(value) ?? "n/a";
}

function currencyOf(data: FindingData): string {
  return typeof data.currency === "string" && data.currency.length > 0
    ? data.currency
    : "EUR";
}

function moneyText(data: FindingData, key: string): string {
  const cents = data[key];
  if (typeof cents !== "number") return formatMoney(0, currencyOf(data));
  return formatMoney(cents, currencyOf(data));
}

function goalSentence(data: FindingData, state: string): string {
  const count = typeof data.goalCount === "number" ? data.goalCount : 0;
  const names = typeof data.goalNames === "string" ? data.goalNames : "";
  const noun = count === 1 ? "goal is" : "goals are";
  return `${count} ${noun} ${state}: ${names}.`;
}

const TEMPLATES: Record<string, { title: string; body: (data: FindingData) => string }> = {
  low_savings_rate: {
    title: "Low savings rate",
    body: (data) =>
      `Your savings rate is ${percentText(data.savingsRate)} over the last 3 months. Consider reducing discretionary spend.`,
  },
  high_discretionary: {
    title: "High discretionary spend",
    body: (data) =>
      `Discretionary spending is ${percentText(data.discretionaryShare)} of expenses over the last 3 months.`,
  },
  uncategorized_expenses: {
    title: "Uncategorized expenses",
    body: (data) =>
      `Uncategorized expenses are ${percentText(data.uncategorizedCountShare)} by count and ${percentText(data.uncategorizedAmountShare)} by amount over the last 3 months.`,
  },
  emergency_fund_gap: {
    title: "Emergency fund gap",
    body: (data) =>
      `Your emergency fund is short ${moneyText(data, "gapCents")} (${percentText(data.fundedRatio)} funded).`,
  },
  emergency_fund_met: {
    title: "Emergency fund met",
    body: (data) =>
      `Your emergency fund meets its target (${percentText(data.fundedRatio)} funded).`,
  },
  goal_shortfall: {
    title: "Goal shortfall",
    body: (data) =>
      goalSentence(data, "short of the monthly amount needed"),
  },
  goal_tight: {
    title: "Goal on a tight path",
    body: (data) =>
      goalSentence(data, "close to the monthly amount needed"),
  },
  negative_surplus: {
    title: "Negative surplus",
    body: (data) =>
      `Spending exceeded income by ${moneyText(data, "deficitCents")} over the last 3 months.`,
  },
  allocation_drift: {
    title: "Allocation drift",
    body: (data) =>
      `Your ${data.sleeve} sleeve is at ${data.currentPct}% vs a target of ${data.targetPct}% (${data.driftPp} pp off).`,
  },
  cash_concentration: {
    title: "High cash concentration",
    body: (data) =>
      `${percentText(data.cashRatio)} of your assets are held in cash. Consider whether this matches your goals.`,
  },
  liability_ratio: {
    title: "High liability ratio",
    body: (data) =>
      `Liabilities are ${percentText(data.liabilityRatio)} of total assets (${moneyText(data, "totalLiabilitiesCents")} of ${moneyText(data, "totalAssetsCents")}).`,
  },
  stale_snapshots: {
    title: "Stale balance data",
    body: (data) => {
      const count = typeof data.count === "number" ? data.count : 0;
      const noun = count === 1 ? "has" : "have";
      return `${count} asset${count === 1 ? "" : "s"} ${noun} not been updated in over ${STALE_SNAPSHOT_DAYS} days: ${data.names}.`;
    },
  },
  overspend_budget: {
    title: "Budget exceeded",
    body: (data) => {
      const count = typeof data.count === "number" ? data.count : 0;
      return `${count} ${count === 1 ? "category has" : "categories have"} exceeded the monthly budget this month: ${data.names}.`;
    },
  },
  budget_warning: {
    title: "Approaching budget limit",
    body: (data) => {
      const count = typeof data.count === "number" ? data.count : 0;
      return `${count} ${count === 1 ? "category is" : "categories are"} at 80% or more of the monthly budget: ${data.names}.`;
    },
  },
};

/** One template card per finding id. Unknown ids are skipped. */
export function renderTipTemplates(findings: readonly Finding[]): TipTemplate[] {
  const seen = new Set<string>();
  const tips: TipTemplate[] = [];
  for (const finding of findings) {
    if (seen.has(finding.id)) continue;
    const template = TEMPLATES[finding.id];
    if (!template) continue;
    seen.add(finding.id);
    tips.push({
      findingId: finding.id,
      title: template.title,
      body: template.body(finding.data),
    });
  }
  return tips;
}
