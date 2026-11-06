import type { HorizonBucket } from "./goals";
import type { AssetType } from "./net-worth";
import {
  PERSONALITY_TITLES,
  type PersonalityLabel,
} from "./personality";

export type AllocationPercents = {
  cash: number;
  bonds: number;
  equities: number;
  other: number;
};

export const ALLOCATION_BANDS: Record<PersonalityLabel, AllocationPercents> = {
  capital_preserver: { cash: 50, bonds: 35, equities: 10, other: 5 },
  conservative: { cash: 35, bonds: 40, equities: 20, other: 5 },
  balanced: { cash: 15, bonds: 35, equities: 45, other: 5 },
  growth: { cash: 10, bonds: 25, equities: 60, other: 5 },
  aggressive: { cash: 5, bonds: 15, equities: 75, other: 5 },
};

export const ZERO_MIX: AllocationPercents = {
  cash: 0,
  bonds: 0,
  equities: 0,
  other: 0,
};

export const ALLOCATION_BUCKETS = ["cash", "bonds", "equities", "other"] as const;

export type AllocationBucket = (typeof ALLOCATION_BUCKETS)[number];

const BUCKETS = ALLOCATION_BUCKETS;

export function isAllocationBucket(value: string): value is AllocationBucket {
  return (ALLOCATION_BUCKETS as readonly string[]).includes(value);
}

/** Type map used when an asset has no explicit bucket. */
export function defaultAllocationBucket(type: AssetType): AllocationBucket {
  if (type === "cash" || type === "receivable") return "cash";
  if (type === "brokerage" || type === "retirement") return "equities";
  return "other";
}

export function defaultIncludeInAllocation(type: AssetType): boolean {
  return type !== "real_estate" && type !== "vehicle";
}

export type AllocationAsset = {
  type: AssetType;
  latestAmountCents: number | null;
  includeInAllocation: boolean;
  /** When set, overrides the type map. */
  allocationBucket?: AllocationBucket;
};

export type BriefingPriority =
  | "build_emergency_fund"
  | "reserve_short_goals"
  | "align_to_band";

export type BriefingDecision = {
  priorities: BriefingPriority[];
  targetBand: AllocationPercents;
  currentMixPercent: AllocationPercents;
  drift: AllocationPercents;
  emergencyGapCents: number;
  shortGoalRemainingCents: number;
  profileLabel: PersonalityLabel;
  profileTitle: string;
};

export function bandForLabel(label: string): AllocationPercents | null {
  if (!Object.prototype.hasOwnProperty.call(ALLOCATION_BANDS, label)) {
    return null;
  }
  return ALLOCATION_BANDS[label as PersonalityLabel];
}

function bucketFor(asset: AllocationAsset): AllocationBucket {
  return asset.allocationBucket ?? defaultAllocationBucket(asset.type);
}

/** Integer percents that sum to 100. */
function percentsFromCents(
  cents: AllocationPercents,
): AllocationPercents {
  const total = BUCKETS.reduce((sum, key) => sum + cents[key], 0);
  if (total <= 0) return { ...ZERO_MIX };

  const parts = BUCKETS.map((key) => {
    const scaled = cents[key] * 100;
    return {
      key,
      floor: Math.floor(scaled / total),
      remainder: scaled % total,
    };
  });
  let leftover = 100 - parts.reduce((sum, part) => sum + part.floor, 0);
  const ranked = [...parts].sort(
    (a, b) => b.remainder - a.remainder || BUCKETS.indexOf(a.key) - BUCKETS.indexOf(b.key),
  );
  const bonus = new Map<keyof AllocationPercents, number>();
  for (const part of ranked) {
    if (leftover <= 0) break;
    bonus.set(part.key, (bonus.get(part.key) ?? 0) + 1);
    leftover -= 1;
  }

  return {
    cash: parts[0].floor + (bonus.get("cash") ?? 0),
    bonds: parts[1].floor + (bonus.get("bonds") ?? 0),
    equities: parts[2].floor + (bonus.get("equities") ?? 0),
    other: parts[3].floor + (bonus.get("other") ?? 0),
  };
}

export function computeAllocationMix(
  assetsWithLatest: readonly AllocationAsset[],
): AllocationPercents {
  const cents: AllocationPercents = { ...ZERO_MIX };
  for (const asset of assetsWithLatest) {
    if (!asset.includeInAllocation) continue;
    const amount = asset.latestAmountCents ?? 0;
    if (amount <= 0) continue;
    cents[bucketFor(asset)] += amount;
  }
  return percentsFromCents(cents);
}

function subtract(
  current: AllocationPercents,
  target: AllocationPercents,
): AllocationPercents {
  return {
    cash: current.cash - target.cash,
    bonds: current.bonds - target.bonds,
    equities: current.equities - target.equities,
    other: current.other - target.other,
  };
}

export function buildBriefingDecision(
  profile: { label: PersonalityLabel; title?: string },
  emergency: { gapCents: number },
  goals: readonly { bucket: HorizonBucket; remainingCents: number }[],
  mix: AllocationPercents,
): BriefingDecision {
  const targetBand = ALLOCATION_BANDS[profile.label];
  const shortGoalRemainingCents = goals
    .filter((goal) => goal.bucket === "short")
    .reduce((sum, goal) => sum + Math.max(0, goal.remainingCents), 0);
  const priorities: BriefingPriority[] = [];
  if (emergency.gapCents > 0) priorities.push("build_emergency_fund");
  if (shortGoalRemainingCents > 0) priorities.push("reserve_short_goals");
  priorities.push("align_to_band");

  return {
    priorities,
    targetBand: { ...targetBand },
    currentMixPercent: { ...mix },
    drift: subtract(mix, targetBand),
    emergencyGapCents: emergency.gapCents,
    shortGoalRemainingCents,
    profileLabel: profile.label,
    profileTitle: profile.title ?? PERSONALITY_TITLES[profile.label],
  };
}
