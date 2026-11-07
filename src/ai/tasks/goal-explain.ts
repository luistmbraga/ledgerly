import type { GoalStatus, HorizonBucket } from "@/domain/goals";
import {
  BUCKET_GLOSS,
  STATUS_GLOSS,
  formatBpsPercent,
  formatCentsMoney,
} from "../display";
import { goalExplainFallback, type GoalExplainOutput } from "../fallbacks";
import {
  GOAL_EXPLAIN_INSTRUCTIONS,
  GOAL_EXPLAIN_VERSION,
} from "../prompts/goal-explain";
import { runAiTask, type TaskDeps, type TaskResult } from "../run-task";
import { goalExplainJsonSchema, goalExplainSchema } from "../schemas";
import { numbersMissingFromInput } from "../validate";

export type GoalExplainRequest = {
  currency: string;
  avgMonthlySurplusCents: number;
  goal: {
    id: number;
    name: string;
    bucket: HorizonBucket;
    targetAmountCents: number;
    targetDate: string;
    setAsideCents: number;
    remainingCents: number;
    requiredMonthlyCents: number;
    status: GoalStatus;
    plannedMonthlyCents: number | null;
    expectedAnnualReturnBps: number | null;
  };
};

function contractInput(request: GoalExplainRequest) {
  const { currency, goal } = request;
  return {
    task: "goal_explain" as const,
    promptVersion: GOAL_EXPLAIN_VERSION,
    goal: {
      name: goal.name,
      bucket: goal.bucket,
      bucketGloss: BUCKET_GLOSS[goal.bucket] ?? goal.bucket,
      targetAmount: formatCentsMoney(goal.targetAmountCents, currency),
      targetDate: goal.targetDate,
      setAside: formatCentsMoney(goal.setAsideCents, currency),
      remaining: formatCentsMoney(goal.remainingCents, currency),
      requiredMonthly: formatCentsMoney(goal.requiredMonthlyCents, currency),
      status: goal.status,
      statusGloss: STATUS_GLOSS[goal.status] ?? goal.status,
      plannedMonthly: formatCentsMoney(goal.plannedMonthlyCents, currency),
      expectedAnnualReturn: formatBpsPercent(goal.expectedAnnualReturnBps),
    },
    context: {
      currency,
      avgMonthlySurplus: formatCentsMoney(
        request.avgMonthlySurplusCents,
        currency,
      ),
    },
  };
}

function quotableFrom(input: ReturnType<typeof contractInput>): unknown {
  return {
    goal: {
      targetAmount: input.goal.targetAmount,
      setAside: input.goal.setAside,
      remaining: input.goal.remaining,
      requiredMonthly: input.goal.requiredMonthly,
      plannedMonthly: input.goal.plannedMonthly,
      expectedAnnualReturn: input.goal.expectedAnnualReturn,
    },
    context: input.context,
  };
}

export async function explainGoal(
  request: GoalExplainRequest,
  deps?: TaskDeps,
): Promise<TaskResult<GoalExplainOutput>> {
  const input = contractInput(request);
  const quotable = quotableFrom(input);
  return runAiTask({
    task: "goal_explain",
    entityId: String(request.goal.id),
    promptVersion: GOAL_EXPLAIN_VERSION,
    instructions: GOAL_EXPLAIN_INSTRUCTIONS,
    schemaName: "goal_explain",
    jsonSchema: goalExplainJsonSchema,
    zodSchema: goalExplainSchema,
    input,
    deps,
    temperature: 0.2,
    maxTokens: 700,
    repair: true,
    fallback: () => goalExplainFallback(request.goal),
    accept: (value) => numbersMissingFromInput(quotable, value).length === 0,
  });
}
