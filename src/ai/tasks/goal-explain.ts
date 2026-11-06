import type { GoalStatus, HorizonBucket } from "@/domain/goals";
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
  return {
    task: "goal_explain" as const,
    promptVersion: GOAL_EXPLAIN_VERSION,
    goal: request.goal,
    context: {
      currency: request.currency,
      avgMonthlySurplusCents: request.avgMonthlySurplusCents,
    },
  };
}

export async function explainGoal(
  request: GoalExplainRequest,
  deps?: TaskDeps,
): Promise<TaskResult<GoalExplainOutput>> {
  const input = contractInput(request);
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
    fallback: () => goalExplainFallback(request.goal),
    accept: (value) => numbersMissingFromInput(input, value).length === 0,
  });
}
