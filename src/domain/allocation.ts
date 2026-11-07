import { sumShortGoalRemainingCents, type HorizonBucket } from "./goals";
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

export const ALLOCATION_SLEEVES = ["cash", "bonds", "equities", "other"] as const;

export type AllocationSleeve = (typeof ALLOCATION_SLEEVES)[number];

const SLEEVES = ALLOCATION_SLEEVES;

export function isAllocationSleeve(value: string): value is AllocationSleeve {
  return (ALLOCATION_SLEEVES as readonly string[]).includes(value);
}

export function isValidSleevePercents(
  percents: AllocationPercents,
): boolean {
  let sum = 0;
  for (const sleeve of SLEEVES) {
    const value = percents[sleeve];
    if (!Number.isInteger(value) || value < 0 || value > 100) return false;
    sum += value;
  }
  return sum === 100;
}

/** Defaults for a new asset until the user edits sleeve weights. */
export function defaultSleevePercents(type: AssetType): AllocationPercents {
  if (type === "cash") return { cash: 100, bonds: 0, equities: 0, other: 0 };
  if (type === "brokerage" || type === "retirement") {
    return { cash: 0, bonds: 0, equities: 100, other: 0 };
  }
  return { cash: 0, bonds: 0, equities: 0, other: 100 };
}

export function defaultIncludeInAllocation(type: AssetType): boolean {
  return (
    type !== "real_estate" &&
    type !== "vehicle" &&
    type !== "receivable" &&
    type !== "business"
  );
}

export type AllocationAsset = {
  type: AssetType;
  latestAmountCents: number | null;
  includeInAllocation: boolean;
  /** Liquid flag used when reserving the emergency fund from the mix. */
  isLiquid?: boolean;
  /** Sleeve weights that sum to 100. When omitted, use type defaults. */
  sleevePercents?: AllocationPercents;
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
  emergencyReservedCents: number;
  shortGoalRemainingCents: number;
  shortGoalReservedCents: number;
  profileLabel: PersonalityLabel;
  profileTitle: string;
};

export type InvestableMixResult = {
  mix: AllocationPercents;
  emergencyReservedCents: number;
  shortGoalReservedCents: number;
};

export type AllocationReserves = {
  emergencyEligibleCents: number;
  emergencyTargetCents: number;
  shortGoalRemainingCents: number;
};

export function bandForLabel(label: string): AllocationPercents | null {
  if (!Object.prototype.hasOwnProperty.call(ALLOCATION_BANDS, label)) {
    return null;
  }
  return ALLOCATION_BANDS[label as PersonalityLabel];
}

function sleevePercentsFor(asset: AllocationAsset): AllocationPercents {
  if (asset.sleevePercents && isValidSleevePercents(asset.sleevePercents)) {
    return asset.sleevePercents;
  }
  return defaultSleevePercents(asset.type);
}

/** Split an amount across sleeves with largest remainder so parts sum to amount. */
export function splitAmountByPercents(
  amountCents: number,
  percents: AllocationPercents,
): AllocationPercents {
  if (amountCents <= 0) return { ...ZERO_MIX };
  const parts = SLEEVES.map((key) => {
    const scaled = amountCents * percents[key];
    return {
      key,
      floor: Math.floor(scaled / 100),
      remainder: scaled % 100,
    };
  });
  let leftover = amountCents - parts.reduce((sum, part) => sum + part.floor, 0);
  const ranked = [...parts].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      SLEEVES.indexOf(a.key) - SLEEVES.indexOf(b.key),
  );
  const bonus = new Map<AllocationSleeve, number>();
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

/** Integer percents that sum to 100. */
function percentsFromCents(cents: AllocationPercents): AllocationPercents {
  const total = SLEEVES.reduce((sum, key) => sum + cents[key], 0);
  if (total <= 0) return { ...ZERO_MIX };

  const parts = SLEEVES.map((key) => {
    const scaled = cents[key] * 100;
    return {
      key,
      floor: Math.floor(scaled / total),
      remainder: scaled % total,
    };
  });
  let leftover = 100 - parts.reduce((sum, part) => sum + part.floor, 0);
  const ranked = [...parts].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      SLEEVES.indexOf(a.key) - SLEEVES.indexOf(b.key),
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

function addCents(
  target: AllocationPercents,
  addition: AllocationPercents,
): void {
  for (const sleeve of SLEEVES) {
    target[sleeve] += addition[sleeve];
  }
}

/** Weighted sleeve cents from included assets (no reserve removal). */
export function weightedSleeveCents(
  assetsWithLatest: readonly AllocationAsset[],
): { total: AllocationPercents; liquid: AllocationPercents } {
  const total: AllocationPercents = { ...ZERO_MIX };
  const liquid: AllocationPercents = { ...ZERO_MIX };
  for (const asset of assetsWithLatest) {
    if (!asset.includeInAllocation) continue;
    const amount = asset.latestAmountCents ?? 0;
    if (amount <= 0) continue;
    const split = splitAmountByPercents(amount, sleevePercentsFor(asset));
    addCents(total, split);
    if (asset.isLiquid) addCents(liquid, split);
  }
  return { total, liquid };
}

/**
 * Current mix as integer percents.
 * When reserves are provided, removes held emergency fund and short-goal cash
 * before converting to percents (investable / long-term mix).
 */
export function computeAllocationMix(
  assetsWithLatest: readonly AllocationAsset[],
  reserves?: AllocationReserves,
): AllocationPercents {
  return computeInvestableMix(assetsWithLatest, reserves ?? {
    emergencyEligibleCents: 0,
    emergencyTargetCents: 0,
    shortGoalRemainingCents: 0,
  }).mix;
}

export function computeInvestableMix(
  assetsWithLatest: readonly AllocationAsset[],
  reserves: AllocationReserves,
): InvestableMixResult {
  const { total, liquid } = weightedSleeveCents(assetsWithLatest);
  const investable: AllocationPercents = { ...total };

  let emergencyLeft = Math.max(
    0,
    Math.min(reserves.emergencyEligibleCents, reserves.emergencyTargetCents),
  );
  let emergencyReservedCents = 0;
  for (const sleeve of SLEEVES) {
    if (emergencyLeft <= 0) break;
    const available = Math.min(liquid[sleeve], investable[sleeve]);
    const take = Math.min(emergencyLeft, available);
    investable[sleeve] -= take;
    emergencyLeft -= take;
    emergencyReservedCents += take;
  }

  const shortLeft = Math.max(0, reserves.shortGoalRemainingCents);
  const shortGoalReservedCents = Math.min(shortLeft, investable.cash);
  investable.cash -= shortGoalReservedCents;

  return {
    mix: percentsFromCents(investable),
    emergencyReservedCents,
    shortGoalReservedCents,
  };
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
  emergency: { gapCents: number; reservedCents?: number },
  goals: readonly { bucket: HorizonBucket; remainingCents: number }[],
  mix: AllocationPercents,
  shortGoalReservedCents = 0,
): BriefingDecision {
  const targetBand = bandForLabel(profile.label) ?? ZERO_MIX;
  const shortGoalRemainingCents = sumShortGoalRemainingCents(goals);
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
    emergencyReservedCents: emergency.reservedCents ?? 0,
    shortGoalRemainingCents,
    shortGoalReservedCents,
    profileLabel: profile.label,
    profileTitle: profile.title ?? PERSONALITY_TITLES[profile.label],
  };
}
