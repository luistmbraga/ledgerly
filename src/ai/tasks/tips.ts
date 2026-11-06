import type { Finding, FindingSeverity } from "@/domain/findings";
import { tipsFallback, type TipsOutput } from "../fallbacks";
import { TIPS_INSTRUCTIONS, TIPS_VERSION } from "../prompts/tips";
import { runAiTask, type TaskDeps, type TaskResult } from "../run-task";
import { tipsJsonSchema, tipsSchema } from "../schemas";
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

function contractInput(request: TipsRequest) {
  return {
    task: "tips" as const,
    promptVersion: TIPS_VERSION,
    snapshot: {
      currency: request.currency,
      cashflow: request.cashflow,
      emergencyFund: request.emergencyFund,
      findings: request.findings,
    },
  };
}

export async function narrateTips(
  request: TipsRequest,
  deps?: TaskDeps,
): Promise<TaskResult<TipsOutput>> {
  const input = contractInput(request);
  const allowed = new Set(request.findings.map((finding) => finding.id));
  return runAiTask({
    task: "tips",
    entityId: "dashboard",
    promptVersion: TIPS_VERSION,
    instructions: TIPS_INSTRUCTIONS,
    schemaName: "tips",
    jsonSchema: tipsJsonSchema,
    zodSchema: tipsSchema,
    input,
    deps,
    fallback: () => tipsFallback(request.findings),
    accept: (value) => {
      const seen = new Set<string>();
      for (const tip of value.tips) {
        if (!allowed.has(tip.findingId) || seen.has(tip.findingId)) return false;
        seen.add(tip.findingId);
      }
      return numbersMissingFromInput(input, value).length === 0;
    },
  });
}

export type NarratedTip = {
  findingId: string;
  title: string;
  body: string;
  severity: FindingSeverity;
};

export async function narrateDashboardTips(deps?: TaskDeps): Promise<
  TaskResult<TipsOutput> & { tips: NarratedTip[] }
> {
  const snapshot = loadFinancialSnapshot();
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
