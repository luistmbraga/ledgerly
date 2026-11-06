import type { BriefingDecision } from "@/domain/allocation";
import { buildBriefingDecision } from "@/domain/allocation";
import { listAssets } from "@/db/repositories/assets";
import type { PersonalityLabel } from "@/domain/personality";
import { PERSONALITY_TITLES } from "@/domain/personality";
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

function contractInput(request: BriefingRequest) {
  return {
    task: "briefing" as const,
    promptVersion: BRIEFING_VERSION,
    disclaimerRequired: true,
    decision: request.decision,
    snapshotNetWorthCents: request.snapshotNetWorthCents,
    currency: request.currency,
  };
}

export async function narrateBriefing(
  request: BriefingRequest,
  deps?: TaskDeps,
): Promise<TaskResult<BriefingOutput>> {
  const input = contractInput(request);
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
    fallback: () => briefingFallback(request),
    accept: (value) =>
      briefingProhibitedReason(value) === null &&
      numbersMissingFromInput(input, value).length === 0,
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
    { gapCents: snapshot.emergencyFund.gapCents },
    snapshot.goals,
    snapshot.allocation.currentMix,
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
