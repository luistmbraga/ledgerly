import { describe, expect, it } from "vitest";
import { summarizeInterest, yearlyInterestCents } from "./interest";

describe("yearlyInterestCents", () => {
  it("is balance × rate", () => {
    expect(yearlyInterestCents(1_000_000, 250)).toBe(25_000);
  });
  it("rounds to the nearest cent", () => {
    expect(yearlyInterestCents(333, 150)).toBe(5); // 4.995
  });
  it("is zero at 0%", () => {
    expect(yearlyInterestCents(1_000_000, 0)).toBe(0);
  });
});

describe("summarizeInterest", () => {
  it("returns zeros and null rates with no rated accounts", () => {
    expect(
      summarizeInterest(
        [{ name: "Wallet", balanceCents: 5_000, annualRateBps: null }],
        [],
      ),
    ).toEqual({
      earnedPerYearCents: 0,
      ratedAssetCents: 0,
      weightedAssetRateBps: null,
      costPerYearCents: 0,
      ratedLiabilityCents: 0,
      weightedLiabilityRateBps: null,
    });
  });

  it("sums rated assets and weights the rate by balance", () => {
    const result = summarizeInterest(
      [
        { name: "Savings", balanceCents: 1_000_000, annualRateBps: 300 },
        { name: "Deposit", balanceCents: 3_000_000, annualRateBps: 100 },
        { name: "Current", balanceCents: 200_000, annualRateBps: null },
      ],
      [],
    );
    expect(result.earnedPerYearCents).toBe(30_000 + 30_000);
    expect(result.ratedAssetCents).toBe(4_000_000);
    expect(result.weightedAssetRateBps).toBe(150);
  });

  it("counts an explicit 0% balance in the weighted rate", () => {
    const result = summarizeInterest(
      [
        { name: "Savings", balanceCents: 100_000, annualRateBps: 400 },
        { name: "Current", balanceCents: 100_000, annualRateBps: 0 },
      ],
      [],
    );
    expect(result.weightedAssetRateBps).toBe(200);
  });

  it("summarizes liability cost and skips zero balances", () => {
    const result = summarizeInterest(
      [],
      [
        { name: "Card", balanceCents: 200_000, annualRateBps: 1_800 },
        { name: "Paid off", balanceCents: 0, annualRateBps: 900 },
      ],
    );
    expect(result.costPerYearCents).toBe(36_000);
    expect(result.ratedLiabilityCents).toBe(200_000);
    expect(result.weightedLiabilityRateBps).toBe(1_800);
  });
});
