import type { Finding, FindingSeverity } from "@/domain/findings";
import {
  FINDING_GLOSS,
  formatCentsMoney,
  formatRatioPercent,
} from "../display";
import { tipsFallback, type TipsOutput } from "../fallbacks";
import { TIPS_INSTRUCTIONS, TIPS_VERSION } from "../prompts/tips";
import { runAiTask, type TaskDeps, type TaskResult } from "../run-task";
import { tipsSchema, tipsSchemaForFindingIds } from "../schemas";
import { numbersMissingFromInput } from "../validate";
import { loadFinancialSnapshot } from "../load-snapshot";

export type TipsRequest = {
  currency: string;
  cashflow: {
    trailingMonths: 3;
    incomeCents: number;
    expenseCents: number;
    surplusCents: number;
    savingsRate: number | null;
    essentialMonthlyAverageCents: number;
    discretionaryShareOfExpenses: number | null;
    uncategorizedExpenseShare: number | null;
  };
  emergencyFund: {
    targetMonths: number;
    targetCents: number;
    eligibleCents: number;
    fundedRatio: number | null;
    gapCents: number;
    avgMonthlySurplusCents: number | null;
    monthsToCloseGap: number | null;
  };
  findings: Finding[];
};

const RATIO_KEYS = new Set([
  "savingsRate",
  "discretionaryShare",
  "fundedRatio",
  "uncategorizedCountShare",
  "uncategorizedAmountShare",
]);

function formatFindingData(
  data: Finding["data"],
  currency: string,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "number" && key.endsWith("Cents")) {
      out[key.replace(/Cents$/, "")] = formatCentsMoney(value, currency);
      continue;
    }
    if (RATIO_KEYS.has(key)) {
      out[key] = typeof value === "number" ? formatRatioPercent(value) : null;
      continue;
    }
    if (typeof value === "number") {
      out[key] = String(value);
      continue;
    }
    if (typeof value === "string" || typeof value === "boolean" || value === null) {
      out[key] = value;
    }
  }
  return out;
}

function contractInput(request: TipsRequest) {
  const currency = request.currency;
  return {
    task: "tips" as const,
    promptVersion: TIPS_VERSION,
    snapshot: {
      currency,
      cashflow: {
        trailingMonths: String(request.cashflow.trailingMonths),
        income: formatCentsMoney(request.cashflow.incomeCents, currency),
        expense: formatCentsMoney(request.cashflow.expenseCents, currency),
        surplus: formatCentsMoney(request.cashflow.surplusCents, currency),
        savingsRate: formatRatioPercent(request.cashflow.savingsRate),
        essentialMonthlyAverage: formatCentsMoney(
          request.cashflow.essentialMonthlyAverageCents,
          currency,
        ),
        discretionaryShareOfExpenses: formatRatioPercent(
          request.cashflow.discretionaryShareOfExpenses,
        ),
        uncategorizedExpenseShare: formatRatioPercent(
          request.cashflow.uncategorizedExpenseShare,
        ),
      },
      emergencyFund: {
        targetMonths: String(request.emergencyFund.targetMonths),
        target: formatCentsMoney(request.emergencyFund.targetCents, currency),
        eligible: formatCentsMoney(
          request.emergencyFund.eligibleCents,
          currency,
        ),
        fundedRatio: formatRatioPercent(request.emergencyFund.fundedRatio),
        gap: formatCentsMoney(request.emergencyFund.gapCents, currency),
        avgMonthlySurplus: formatCentsMoney(
          request.emergencyFund.avgMonthlySurplusCents,
          currency,
        ),
        monthsToCloseGap:
          request.emergencyFund.monthsToCloseGap === null
            ? null
            : String(request.emergencyFund.monthsToCloseGap),
      },
      findings: request.findings.map((finding) => ({
        id: finding.id,
        severity: finding.severity,
        gloss: FINDING_GLOSS[finding.id] ?? finding.id,
        data: formatFindingData(finding.data, currency),
      })),
    },
  };
}

function quotableFrom(input: ReturnType<typeof contractInput>): unknown {
  return {
    cashflow: input.snapshot.cashflow,
    emergencyFund: {
      target: input.snapshot.emergencyFund.target,
      eligible: input.snapshot.emergencyFund.eligible,
      fundedRatio: input.snapshot.emergencyFund.fundedRatio,
      gap: input.snapshot.emergencyFund.gap,
      avgMonthlySurplus: input.snapshot.emergencyFund.avgMonthlySurplus,
      monthsToCloseGap: input.snapshot.emergencyFund.monthsToCloseGap,
      targetMonths: input.snapshot.emergencyFund.targetMonths,
    },
    findings: input.snapshot.findings.map((finding) => finding.data),
  };
}

export async function narrateTips(
  request: TipsRequest,
  deps?: TaskDeps,
): Promise<TaskResult<TipsOutput>> {
  const input = contractInput(request);
  const allowed = new Set(request.findings.map((finding) => finding.id));
  const quotable = quotableFrom(input);
  return runAiTask({
    task: "tips",
    entityId: "dashboard",
    promptVersion: TIPS_VERSION,
    instructions: TIPS_INSTRUCTIONS,
    schemaName: "tips",
    jsonSchema: tipsSchemaForFindingIds(
      request.findings.map((finding) => finding.id),
    ),
    zodSchema: tipsSchema,
    input,
    deps,
    temperature: 0.2,
    maxTokens: 800,
    fallback: () => tipsFallback(request.findings),
    accept: (value) => {
      const seen = new Set<string>();
      const kept: TipsOutput["tips"] = [];
      for (const tip of value.tips) {
        if (!allowed.has(tip.findingId) || seen.has(tip.findingId)) continue;
        if (numbersMissingFromInput(quotable, tip).length > 0) continue;
        seen.add(tip.findingId);
        kept.push(tip);
      }
      if (kept.length === 0) {
        return { ok: false, reason: "no valid tips" };
      }
      return {
        ok: true,
        value: { ...value, tips: kept, refused: undefined, reason: undefined },
      };
    },
  });
}

export type NarratedTip = {
  findingId: string;
  title: string;
  body: string;
  severity: FindingSeverity;
};

export async function narrateDashboardTips(asOfDate?: string, deps?: TaskDeps): Promise<
  TaskResult<TipsOutput> & { tips: NarratedTip[] }
> {
  const snapshot = loadFinancialSnapshot(asOfDate);
  const result = await narrateTips(
    {
      currency: snapshot.currency,
      cashflow: snapshot.cashflow,
      emergencyFund: snapshot.emergencyFund,
      findings: snapshot.findings,
    },
    deps,
  );
  const severityById = new Map(
    snapshot.findings.map((finding) => [finding.id, finding.severity]),
  );
  return {
    ...result,
    tips: result.output.tips.map((tip) => ({
      findingId: tip.findingId,
      title: tip.title,
      body: tip.body,
      severity: severityById.get(tip.findingId) ?? "info",
    })),
  };
}
