import { describe, expect, it } from "vitest";
import { buildFinancialSnapshot } from "./financial-snapshot";
import { ASSET_TYPES, type AssetType } from "./net-worth";
import {
  buildBriefingDecision,
  computeAllocationMix,
  defaultAllocationBucket,
  defaultIncludeInAllocation,
  type AllocationAsset,
  type AllocationBucket,
} from "./allocation";

function asset(
  type: AllocationAsset["type"],
  latestAmountCents: number | null,
  includeInAllocation = true,
  allocationBucket?: AllocationBucket,
): AllocationAsset {
  return { type, latestAmountCents, includeInAllocation, allocationBucket };
}

function zeroByAssetType(): Record<AssetType, number> {
  return Object.fromEntries(ASSET_TYPES.map((type) => [type, 0])) as Record<
    AssetType,
    number
  >;
}

describe("allocation defaults", () => {
  it("keeps property and vehicles out of the mix and maps types to buckets", () => {
    expect(defaultIncludeInAllocation("real_estate")).toBe(false);
    expect(defaultIncludeInAllocation("vehicle")).toBe(false);
    expect(defaultIncludeInAllocation("cash")).toBe(true);
    expect(defaultIncludeInAllocation("brokerage")).toBe(true);
    expect(defaultAllocationBucket("cash")).toBe("cash");
    expect(defaultAllocationBucket("receivable")).toBe("cash");
    expect(defaultAllocationBucket("brokerage")).toBe("equities");
    expect(defaultAllocationBucket("retirement")).toBe("equities");
    expect(defaultAllocationBucket("real_estate")).toBe("other");
    expect(defaultAllocationBucket("crypto")).toBe("other");
  });
});

describe("computeAllocationMix", () => {
  it("maps asset types into cash, equities, and other, leaving bonds at 0", () => {
    expect(
      computeAllocationMix([
        asset("cash", 4_000),
        asset("receivable", 0),
        asset("brokerage", 3_000),
        asset("retirement", 2_000),
        asset("crypto", 500),
        asset("real_estate", 300),
        asset("vehicle", 200),
        asset("business", 0),
        asset("other", 0),
      ]),
    ).toEqual({ cash: 40, bonds: 0, equities: 50, other: 10 });
  });

  it("skips assets excluded from allocation and assets without a positive snapshot", () => {
    expect(
      computeAllocationMix([
        asset("cash", 100, false),
        asset("brokerage", null),
        asset("brokerage", 0),
        asset("cash", 1),
      ]),
    ).toEqual({ cash: 100, bonds: 0, equities: 0, other: 0 });
  });

  it("returns zeros when nothing is included", () => {
    expect(computeAllocationMix([])).toEqual({
      cash: 0,
      bonds: 0,
      equities: 0,
      other: 0,
    });
  });

  it("uses an explicit bucket instead of the type map", () => {
    expect(
      computeAllocationMix([
        asset("brokerage", 1_500, true, "bonds"),
        asset("other", 3_000, true, "cash"),
        asset("cash", 5_500),
      ]),
    ).toEqual({ cash: 85, bonds: 15, equities: 0, other: 0 });
  });

  it("uses largest remainder so uneven cents still sum to 100", () => {
    const mix = computeAllocationMix([
      asset("cash", 1),
      asset("brokerage", 1),
      asset("crypto", 1),
    ]);
    expect(mix.bonds).toBe(0);
    expect(mix.cash + mix.equities + mix.other).toBe(100);
  });
});

describe("buildBriefingDecision", () => {
  it("builds the balanced example from precomputed mix, gap, and short goals", () => {
    const decision = buildBriefingDecision(
      { label: "balanced" },
      { gapCents: 300_000 },
      [
        { bucket: "short", remainingCents: 600_000 },
        { bucket: "short", remainingCents: 400_000 },
        { bucket: "mid", remainingCents: 5_000_000 },
      ],
      { cash: 40, bonds: 0, equities: 50, other: 10 },
    );

    expect(decision).toEqual({
      priorities: [
        "build_emergency_fund",
        "reserve_short_goals",
        "align_to_band",
      ],
      targetBand: { cash: 15, bonds: 35, equities: 45, other: 5 },
      currentMixPercent: { cash: 40, bonds: 0, equities: 50, other: 10 },
      drift: { cash: 25, bonds: -35, equities: 5, other: 5 },
      emergencyGapCents: 300_000,
      shortGoalRemainingCents: 1_000_000,
      profileLabel: "balanced",
      profileTitle: "Balanced",
    });
  });

  it("omits emergency and short-goal priorities when those amounts are zero", () => {
    const decision = buildBriefingDecision(
      { label: "aggressive", title: "Aggressive" },
      { gapCents: 0 },
      [{ bucket: "long", remainingCents: 50 }],
      { cash: 5, bonds: 0, equities: 75, other: 20 },
    );
    expect(decision.priorities).toEqual(["align_to_band"]);
    expect(decision.shortGoalRemainingCents).toBe(0);
    expect(decision.targetBand).toEqual({
      cash: 5,
      bonds: 15,
      equities: 75,
      other: 5,
    });
  });
});

describe("buildFinancialSnapshot allocation", () => {
  it("fills the current mix, target band, and short-goal cash from inputs", () => {
    const snapshot = buildFinancialSnapshot({
      asOf: "2026-11-04",
      currency: "EUR",
      netWorth: {
        totalAssetsCents: 100,
        totalLiabilitiesCents: 0,
        netWorthCents: 100,
        byAssetType: { ...zeroByAssetType(), cash: 40, brokerage: 50, crypto: 10 },
      },
      emergencyFund: {
        targetMonths: 6,
        essentialMonthlyAverageCents: 0,
        targetCents: 0,
        eligibleCents: 0,
        fundedRatio: null,
        gapCents: 300_000,
        avgMonthlySurplusCents: 0,
        monthsToCloseGap: null,
      },
      incomes: [],
      expenses: [],
      categories: [],
      goals: [
        {
          id: 1,
          name: "Holiday",
          targetAmountCents: 1_000,
          targetDate: "2027-05-01",
          setAsideCents: 0,
          plannedMonthlyCents: 0,
          expectedAnnualReturnBps: null,
        },
      ],
      investorProfile: {
        label: "balanced",
        title: "Balanced",
        riskScore: 50,
        horizonScore: 55,
        experienceScore: 55,
        liquidityScore: 20,
      },
      allocationAssets: [
        asset("cash", 40),
        asset("brokerage", 50),
        asset("crypto", 10),
        asset("cash", 9_000, false),
      ],
    });

    expect(snapshot.goals[0]?.bucket).toBe("short");
    expect(snapshot.allocation).toEqual({
      targetBand: { cash: 15, bonds: 35, equities: 45, other: 5 },
      currentMix: { cash: 40, bonds: 0, equities: 50, other: 10 },
      shortGoalRemainingCents: 1_000,
    });
  });
});
