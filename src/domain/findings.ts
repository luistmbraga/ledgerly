import type { GoalStatus } from "./goals";
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
  expenseCents: number;
  discretionaryCents: number;
  expenseCount: number;
  uncategorizedExpenseCount: number;
  uncategorizedExpenseAmountCents: number;
  gapCents: number;
  fundedRatio: number | null;
  goals: ReadonlyArray<{ name: string; status: GoalStatus }>;
};

const LOW_SAVINGS_RATE = 0.1;
const HIGH_DISCRETIONARY_SHARE = 0.4;
const UNCATEGORIZED_SHARE = 0.15;

function ratio(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return part / whole;
}

function goalsWithStatus(input: FindingsInput, status: GoalStatus): string[] {
  return input.goals
    .filter((goal) => goal.status === status)
    .map((goal) => goal.name);
}

export function buildFindings(snapshotInputs: FindingsInput): Finding[] {
  const savingsRate =
    snapshotInputs.incomeCents > 0
      ? snapshotInputs.surplusCents / snapshotInputs.incomeCents
      : null;
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
