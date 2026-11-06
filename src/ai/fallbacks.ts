import type { Finding } from "@/domain/findings";
import { renderTipTemplates } from "@/domain/findings";
import { formatMoney } from "@/lib/money";
import type { GoalStatus } from "@/domain/goals";
import { goalTemplateExplanation } from "@/app/goals/labels";
import type { BriefingDecision } from "@/domain/allocation";
import { z } from "zod";
import { BRIEFING_DISCLAIMER } from "./prompts/briefing";
import {
  briefingSchema,
  categorySuggestSchema,
  goalExplainSchema,
  tipsSchema,
} from "./schemas";

export type CategorySuggestOutput = z.infer<typeof categorySuggestSchema>;
export type TipsOutput = z.infer<typeof tipsSchema>;
export type GoalExplainOutput = z.infer<typeof goalExplainSchema>;
export type BriefingOutput = z.infer<typeof briefingSchema>;

export function categorySuggestFallback(suggestion: {
  categoryId: number | null;
  rationale: string;
}): CategorySuggestOutput {
  return {
    categoryId: suggestion.categoryId,
    confidence: "low",
    rationale: suggestion.rationale.slice(0, 200),
  };
}

export function tipsFallback(findings: readonly Finding[]): TipsOutput {
  return {
    tips: renderTipTemplates(findings).slice(0, 6).map((tip) => ({
      findingId: tip.findingId,
      title: tip.title.slice(0, 80),
      body: tip.body.slice(0, 400),
    })),
  };
}

export function goalExplainFallback(goal: {
  status: GoalStatus;
  remainingCents: number;
  plannedMonthlyCents: number | null;
  expectedAnnualReturnBps: number | null;
}): GoalExplainOutput {
  const summary = goalTemplateExplanation({
    status: goal.status,
    remainingCents: goal.remainingCents,
    hasPlannedMonthly: goal.plannedMonthlyCents !== null,
    hasExpectedReturn: goal.expectedAnnualReturnBps !== null,
  });
  const pace =
    goal.status === "on_track"
      ? "The current pace covers the required monthly contribution."
      : goal.status === "tight"
        ? "The current pace is close to the required monthly contribution and still short of it."
        : "The current pace is below the required monthly contribution.";
  return {
    summary: summary.slice(0, 500),
    steps: [
      "Use the required monthly contribution already calculated on this page.",
      "Leave the status and the target date as they are.",
      pace,
    ],
  };
}

export function briefingFallback(input: {
  decision: BriefingDecision;
  currency: string;
}): BriefingOutput {
  const { decision, currency } = input;
  const sections: BriefingOutput["sections"] = [];
  if (decision.emergencyGapCents > 0) {
    sections.push({
      heading: "Emergency fund",
      body: `Build the emergency fund before increasing risk assets. The gap is ${formatMoney(decision.emergencyGapCents, currency)}.`,
    });
  }
  if (decision.shortGoalRemainingCents > 0) {
    sections.push({
      heading: "Near-term goals",
      body: `Keep ${formatMoney(decision.shortGoalRemainingCents, currency)} for short-term goals in cash-like holdings. That portion sits outside the equity band.`,
    });
  }
  sections.push({
    heading: "Allocation band",
    body: [
      `Your ${decision.profileTitle} band targets cash ${decision.targetBand.cash}%, bonds ${decision.targetBand.bonds}%, equities ${decision.targetBand.equities}%, and other ${decision.targetBand.other}%.`,
      `Current mix is cash ${decision.currentMixPercent.cash}%, bonds ${decision.currentMixPercent.bonds}%, equities ${decision.currentMixPercent.equities}%, and other ${decision.currentMixPercent.other}%.`,
      `Drift in percentage points is cash ${decision.drift.cash}, bonds ${decision.drift.bonds}, equities ${decision.drift.equities}, and other ${decision.drift.other}.`,
      "Bond exposure may live inside retirement or brokerage funds, so the bonds bucket stays at 0 until those holdings are separated.",
    ].join(" "),
  });
  return {
    headline: `${decision.profileTitle} allocation briefing`.slice(0, 120),
    sections,
    disclaimer: BRIEFING_DISCLAIMER,
  };
}
