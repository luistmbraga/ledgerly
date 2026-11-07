import type { BriefingDecision } from "@/domain/allocation";
import { buildBriefingDecision } from "@/domain/allocation";
import { listAssets } from "@/db/repositories/assets";
import type { PersonalityLabel } from "@/domain/personality";
import { PERSONALITY_TITLES } from "@/domain/personality";
import {
  PRIORITY_GLOSS,
  formatCentsMoney,
  formatDriftPp,
  formatWholePercent,
} from "../display";
import { briefingFallback, type BriefingOutput } from "../fallbacks";
import { loadFinancialSnapshot } from "../load-snapshot";
import {
  BRIEFING_DISCLAIMER,
  BRIEFING_INSTRUCTIONS,
  BRIEFING_VERSION,
} from "../prompts/briefing";
import { runAiTask, type TaskDeps, type TaskResult } from "../run-task";
import { briefingJsonSchema, briefingSchema } from "../schemas";
import { briefingProhibitedReason, numbersMissingFromInput } from "../validate";

export type BriefingRequest = {
  decision: BriefingDecision;
  snapshotNetWorthCents: number;
  currency: string;
};

function formatMix(
  mix: BriefingDecision["targetBand"],
  drift = false,
): Record<string, string> {
  return {
    cash: drift ? formatDriftPp(mix.cash) : formatWholePercent(mix.cash),
    bonds: drift ? formatDriftPp(mix.bonds) : formatWholePercent(mix.bonds),
    equities: drift
      ? formatDriftPp(mix.equities)
      : formatWholePercent(mix.equities),
    other: drift ? formatDriftPp(mix.other) : formatWholePercent(mix.other),
  };
}

function contractInput(request: BriefingRequest) {
  const { decision, currency } = request;
  return {
    task: "briefing" as const,
    promptVersion: BRIEFING_VERSION,
    disclaimerRequired: true,
    decision: {
      priorities: decision.priorities.map((id) => ({
        id,
        gloss: PRIORITY_GLOSS[id] ?? id,
      })),
      targetBand: formatMix(decision.targetBand),
      currentMixPercent: formatMix(decision.currentMixPercent),
      drift: formatMix(decision.drift, true),
      emergencyGap: formatCentsMoney(decision.emergencyGapCents, currency),
      emergencyReserved: formatCentsMoney(
        decision.emergencyReservedCents,
        currency,
      ),
      shortGoalRemaining: formatCentsMoney(
        decision.shortGoalRemainingCents,
        currency,
      ),
      shortGoalReserved: formatCentsMoney(
        decision.shortGoalReservedCents,
        currency,
      ),
      profileLabel: decision.profileLabel,
      profileTitle: decision.profileTitle,
    },
    snapshotNetWorth: formatCentsMoney(
      request.snapshotNetWorthCents,
      currency,
    ),
    currency,
  };
}

function quotableFrom(input: ReturnType<typeof contractInput>): unknown {
  return {
    decision: {
      targetBand: input.decision.targetBand,
      currentMixPercent: input.decision.currentMixPercent,
      drift: input.decision.drift,
      emergencyGap: input.decision.emergencyGap,
      emergencyReserved: input.decision.emergencyReserved,
      shortGoalRemaining: input.decision.shortGoalRemaining,
      shortGoalReserved: input.decision.shortGoalReserved,
    },
    snapshotNetWorth: input.snapshotNetWorth,
    currency: input.currency,
  };
}

export async function narrateBriefing(
  request: BriefingRequest,
  deps?: TaskDeps,
): Promise<TaskResult<BriefingOutput>> {
  const input = contractInput(request);
  const quotable = quotableFrom(input);
  const result = await runAiTask({
    task: "briefing",
    entityId: "profile",
    promptVersion: BRIEFING_VERSION,
    instructions: BRIEFING_INSTRUCTIONS,
    schemaName: "briefing",
    jsonSchema: briefingJsonSchema,
    zodSchema: briefingSchema,
    input,
    deps,
    temperature: 0.2,
    maxTokens: 1200,
    repair: true,
    fallback: () => briefingFallback(request),
    accept: (value) => {
      const prohibited = briefingProhibitedReason(value);
      if (prohibited !== null) {
        return { ok: false, reason: `prohibited: ${prohibited}` };
      }
      if (numbersMissingFromInput(quotable, value).length > 0) {
        return { ok: false, reason: "invented numbers" };
      }
      return { ok: true, value };
    },
  });
  return {
    ...result,
    output: {
      ...result.output,
      disclaimer: BRIEFING_DISCLAIMER,
    },
  };
}

export function isPersonalityLabel(value: string): value is PersonalityLabel {
  return Object.prototype.hasOwnProperty.call(PERSONALITY_TITLES, value);
}

export type PropertyOrVehicleInMix = {
  id: number;
  name: string;
  type: "real_estate" | "vehicle";
};

export async function loadBriefing(deps?: TaskDeps): Promise<{
  decision: BriefingDecision;
  currency: string;
  narration: TaskResult<BriefingOutput>;
  propertyOrVehiclesInMix: PropertyOrVehicleInMix[];
} | null> {
  const snapshot = loadFinancialSnapshot();
  const profile = snapshot.investorProfile;
  if (!profile || !isPersonalityLabel(profile.label)) return null;
  const decision = buildBriefingDecision(
    { label: profile.label, title: profile.title },
    {
      gapCents: snapshot.emergencyFund.gapCents,
      reservedCents: snapshot.allocation.emergencyReservedCents,
    },
    snapshot.goals,
    snapshot.allocation.currentMix,
    snapshot.allocation.shortGoalReservedCents,
  );
  const narration = await narrateBriefing(
    {
      decision,
      snapshotNetWorthCents: snapshot.netWorth.netWorthCents,
      currency: snapshot.currency,
    },
    deps,
  );
  const propertyOrVehiclesInMix = listAssets()
    .filter(
      (asset): asset is typeof asset & { type: "real_estate" | "vehicle" } =>
        asset.includeInAllocation &&
        (asset.type === "real_estate" || asset.type === "vehicle"),
    )
    .map((asset) => ({ id: asset.id, name: asset.name, type: asset.type }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  return {
    decision,
    currency: snapshot.currency,
    narration,
    propertyOrVehiclesInMix,
  };
}
