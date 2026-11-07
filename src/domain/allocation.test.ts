import { describe, expect, it } from "vitest";
import { buildFinancialSnapshot } from "./financial-snapshot";
import { ASSET_TYPES, type AssetType } from "./net-worth";
import {
  buildBriefingDecision,
  computeAllocationMix,
  computeInvestableMix,
  defaultIncludeInAllocation,
  defaultSleevePercents,
  isValidSleevePercents,
  type AllocationAsset,
  type AllocationPercents,
} from "./allocation";

function asset(
  type: AllocationAsset["type"],
  latestAmountCents: number | null,
  options: {
    includeInAllocation?: boolean;
    isLiquid?: boolean;
    sleevePercents?: AllocationPercents;
  } = {},
): AllocationAsset {
  return {
    type,
    latestAmountCents,
    includeInAllocation: options.includeInAllocation ?? true,
    isLiquid: options.isLiquid,
    sleevePercents: options.sleevePercents,
  };
}

function zeroByAssetType(): Record<AssetType, number> {
  return Object.fromEntries(ASSET_TYPES.map((type) => [type, 0])) as Record<
    AssetType,
    number
  >;
}

describe("allocation defaults", () => {
  it("keeps property, vehicles, receivables, and businesses out of the mix", () => {
    expect(defaultIncludeInAllocation("real_estate")).toBe(false);
    expect(defaultIncludeInAllocation("vehicle")).toBe(false);
    expect(defaultIncludeInAllocation("receivable")).toBe(false);
    expect(defaultIncludeInAllocation("business")).toBe(false);
    expect(defaultIncludeInAllocation("cash")).toBe(true);
    expect(defaultIncludeInAllocation("brokerage")).toBe(true);
    expect(defaultSleevePercents("cash")).toEqual({
      cash: 100,
      bonds: 0,
      equities: 0,
      other: 0,
    });
    expect(defaultSleevePercents("brokerage")).toEqual({
      cash: 0,
      bonds: 0,
      equities: 100,
      other: 0,
    });
    expect(defaultSleevePercents("retirement")).toEqual({
      cash: 0,
      bonds: 0,
      equities: 100,
      other: 0,
    });
    expect(defaultSleevePercents("crypto")).toEqual({
      cash: 0,
      bonds: 0,
      equities: 0,
      other: 100,
    });
    expect(defaultSleevePercents("receivable")).toEqual({
      cash: 0,
      bonds: 0,
      equities: 0,
      other: 100,
    });
  });

  it("rejects sleeve percents that do not sum to 100", () => {
    expect(
      isValidSleevePercents({ cash: 60, bonds: 40, equities: 0, other: 0 }),
    ).toBe(true);
    expect(
      isValidSleevePercents({ cash: 60, bonds: 30, equities: 0, other: 0 }),
    ).toBe(false);
    expect(
      isValidSleevePercents({ cash: 50.5, bonds: 49.5, equities: 0, other: 0 }),
    ).toBe(false);
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

  it("splits a mixed account across sleeves", () => {
    expect(
      computeAllocationMix([
        asset("brokerage", 10_000, {
          sleevePercents: { cash: 0, bonds: 40, equities: 60, other: 0 },
        }),
      ]),
    ).toEqual({ cash: 0, bonds: 40, equities: 60, other: 0 });
  });

  it("skips assets excluded from allocation and assets without a positive snapshot", () => {
    expect(
      computeAllocationMix([
        asset("cash", 100, { includeInAllocation: false }),
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

  it("uses explicit sleeve percents instead of the type defaults", () => {
    expect(
      computeAllocationMix([
        asset("brokerage", 1_500, {
          sleevePercents: { cash: 0, bonds: 100, equities: 0, other: 0 },
        }),
        asset("other", 3_000, {
          sleevePercents: { cash: 100, bonds: 0, equities: 0, other: 0 },
        }),
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

describe("computeInvestableMix", () => {
  it("removes held emergency cash and short-goal reserve before measuring drift", () => {
    const result = computeInvestableMix(
      [
        asset("cash", 1_000_000, { isLiquid: true }),
        asset("brokerage", 900_000),
      ],
      {
        emergencyEligibleCents: 400_000,
        emergencyTargetCents: 400_000,
        shortGoalRemainingCents: 100_000,
      },
    );

    // After removing 400k emergency + 100k short goals from 1M cash,
    // investable is 500k cash + 900k equities = 1.4M → ~36/0/64/0
    expect(result.emergencyReservedCents).toBe(400_000);
    expect(result.shortGoalReservedCents).toBe(100_000);
    expect(result.mix).toEqual({ cash: 36, bonds: 0, equities: 64, other: 0 });
  });

  it("does not invent unfunded emergency or short-goal cash", () => {
    const result = computeInvestableMix(
      [asset("brokerage", 100_000)],
      {
        emergencyEligibleCents: 0,
        emergencyTargetCents: 500_000,
        shortGoalRemainingCents: 200_000,
      },
    );
    expect(result.emergencyReservedCents).toBe(0);
    expect(result.shortGoalReservedCents).toBe(0);
    expect(result.mix).toEqual({
      cash: 0,
      bonds: 0,
      equities: 100,
      other: 0,
    });
  });

  it("takes emergency from liquid cash before other liquid sleeves", () => {
    const result = computeInvestableMix(
      [
        asset("brokerage", 100_000, {
          isLiquid: true,
          sleevePercents: { cash: 20, bonds: 30, equities: 50, other: 0 },
        }),
      ],
      {
        emergencyEligibleCents: 25_000,
        emergencyTargetCents: 25_000,
        shortGoalRemainingCents: 0,
      },
    );
    expect(result.emergencyReservedCents).toBe(25_000);
    // 20k cash + 5k bonds removed → remaining 25k bonds + 50k equities
    expect(result.mix).toEqual({ cash: 0, bonds: 33, equities: 67, other: 0 });
  });
});

describe("buildBriefingDecision", () => {
  it("builds the balanced example from precomputed mix, gap, and short goals", () => {
    const decision = buildBriefingDecision(
      { label: "balanced" },
      { gapCents: 300_000, reservedCents: 200_000 },
      [
        { bucket: "short", remainingCents: 600_000 },
        { bucket: "short", remainingCents: 400_000 },
        { bucket: "mid", remainingCents: 5_000_000 },
      ],
      { cash: 40, bonds: 0, equities: 50, other: 10 },
      150_000,
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
      emergencyReservedCents: 200_000,
      shortGoalRemainingCents: 1_000_000,
      shortGoalReservedCents: 150_000,
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
    expect(decision.emergencyReservedCents).toBe(0);
    expect(decision.shortGoalReservedCents).toBe(0);
    expect(decision.targetBand).toEqual({
      cash: 5,
      bonds: 15,
      equities: 75,
      other: 5,
    });
  });
});

describe("buildFinancialSnapshot allocation", () => {
  it("fills the investable mix, target band, and reserved amounts from inputs", () => {
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
        asset("cash", 40, { isLiquid: true }),
        asset("brokerage", 50),
        asset("crypto", 10),
        asset("cash", 9_000, { includeInAllocation: false, isLiquid: true }),
      ],
    });

    expect(snapshot.goals[0]?.bucket).toBe("short");
    expect(snapshot.allocation).toEqual({
      targetBand: { cash: 15, bonds: 35, equities: 45, other: 5 },
      // Short goal remaining is 1000 but cash in mix is only 40, so 40 reserved
      // and investable is 50 equities + 10 other → 83/0/17 wait: remaining cash 0,
      // equities 50, other 10 → 0/0/83/17
      currentMix: { cash: 0, bonds: 0, equities: 83, other: 17 },
      shortGoalRemainingCents: 1_000,
      emergencyReservedCents: 0,
      shortGoalReservedCents: 40,
    });
  });
});
