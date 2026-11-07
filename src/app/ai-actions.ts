"use server";

import { revalidatePath } from "next/cache";
import { getGoal } from "@/db/repositories/goals";
import { todayUtc } from "@/lib/dates";
import { narrateDashboardTips } from "@/ai/tasks/tips";
import { explainGoal } from "@/ai/tasks/goal-explain";
import { loadBriefing } from "@/ai/tasks/briefing";
import { loadGoals } from "@/app/goals/load";

export async function refreshTipsAction(): Promise<void> {
  await narrateDashboardTips(todayUtc());
  revalidatePath("/");
}

export async function refreshBriefingAction(): Promise<void> {
  await loadBriefing(todayUtc());
  revalidatePath("/briefing");
}

export async function explainGoalAction(formData: FormData): Promise<void> {
  const rawId = String(formData.get("goalId") ?? "");
  if (!/^\d+$/.test(rawId)) return;
  const goalId = Number(rawId);
  const goal = getGoal(goalId);
  if (!goal) return;
  const asOfDate = todayUtc();
  const board = loadGoals(asOfDate);
  const view = board.goals.find((item) => item.goal.id === goal.id);
  if (!view) return;
  await explainGoal({
    currency: board.currency,
    avgMonthlySurplusCents: board.avgMonthlySurplusCents,
    goal: {
      id: goal.id,
      name: goal.name,
      bucket: view.feasibility.bucket,
      targetAmountCents: goal.targetAmountCents,
      targetDate: goal.targetDate,
      setAsideCents: goal.setAsideCents,
      remainingCents: view.feasibility.remainingCents,
      requiredMonthlyCents: view.feasibility.requiredMonthlyCents,
      status: view.feasibility.status,
      plannedMonthlyCents: goal.plannedMonthlyCents,
      expectedAnnualReturnBps: goal.expectedAnnualReturnBps,
    },
  });
  revalidatePath(`/goals/${goalId}`);
}
