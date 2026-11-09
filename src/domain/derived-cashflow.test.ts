import { describe, expect, it } from "vitest";
import { deriveMonthSurplus } from "./derived-cashflow";
import type { DerivedAssetInput } from "./derived-cashflow";
import type { DateRange } from "./cashflow";

const JAN: DateRange = { start: "2026-01-01", end: "2026-01-31" };
const FEB: DateRange = { start: "2026-02-01", end: "2026-02-28" };

function cash(id: number, snapshots: { id: number; recordedOn: string; amountCents: number }[]): DerivedAssetInput {
  return { id, isCash: true, snapshots };
}

function invest(id: number, snapshots: { id: number; recordedOn: string; amountCents: number }[]): DerivedAssetInput {
  return { id, isCash: false, snapshots };
}

describe("deriveMonthSurplus", () => {
  it("returns insufficient_data when no assets have snapshots", () => {
    const result = deriveMonthSurplus([cash(1, [])], JAN);
    expect(result.confidence).toBe("insufficient_data");
    expect(result.surplusCents).toBe(0);
  });

  it("returns insufficient_data when no assets are provided", () => {
    const result = deriveMonthSurplus([], JAN);
    expect(result.confidence).toBe("insufficient_data");
  });

  it("returns insufficient_data when all snapshots are after the range end", () => {
    const result = deriveMonthSurplus(
      [cash(1, [{ id: 1, recordedOn: "2026-02-05", amountCents: 10000 }])],
      JAN,
    );
    expect(result.confidence).toBe("insufficient_data");
  });

  it("cash-only: delta is surplus, confidence high when both opening and closing exist", () => {
    const result = deriveMonthSurplus(
      [cash(1, [
        { id: 1, recordedOn: "2025-12-31", amountCents: 100_000 }, // opening
        { id: 2, recordedOn: "2026-01-20", amountCents: 108_000 }, // closing
      ])],
      JAN,
    );
    expect(result.surplusCents).toBe(8_000);
    expect(result.confidence).toBe("high");
  });

  it("cash-only: new asset with no prior snapshot assumes opening 0, confidence estimated", () => {
    const result = deriveMonthSurplus(
      [cash(1, [{ id: 1, recordedOn: "2026-01-15", amountCents: 50_000 }])],
      JAN,
    );
    expect(result.surplusCents).toBe(50_000);
    expect(result.confidence).toBe("estimated");
  });

  it("two cash assets: sums deltas", () => {
    const result = deriveMonthSurplus(
      [
        cash(1, [
          { id: 1, recordedOn: "2025-12-31", amountCents: 200_000 },
          { id: 2, recordedOn: "2026-01-28", amountCents: 220_000 },
        ]),
        cash(2, [
          { id: 3, recordedOn: "2025-12-15", amountCents: 50_000 },
          { id: 4, recordedOn: "2026-01-05", amountCents: 45_000 },
        ]),
      ],
      JAN,
    );
    // cash1: +20_000, cash2: -5_000
    expect(result.surplusCents).toBe(15_000);
    expect(result.confidence).toBe("high");
  });

  it("investment asset: strips estimated return from delta (5% annual default)", () => {
    // Opening 240_000 cents. Monthly rate ≈ 5%/12 ≈ 0.004167
    // estimatedReturn = round(240_000 × 0.004167) = round(1000.08) = 1000 cents
    const result = deriveMonthSurplus(
      [invest(1, [
        { id: 1, recordedOn: "2025-12-31", amountCents: 240_000 },
        { id: 2, recordedOn: "2026-01-31", amountCents: 250_000 }, // delta = 10_000
      ])],
      JAN,
    );
    // surplus = 10_000 - 1_000 = 9_000
    expect(result.surplusCents).toBe(9_000);
    expect(result.confidence).toBe("estimated");
    expect(result.assumptions.some((a) => a.includes("5%"))).toBe(true);
  });

  it("investment market crash: return is negative, contribution is delta minus negative return", () => {
    // Opening 100_000 cents. If market drops 2% that month, estimatedReturn is still positive 5%/12.
    // This means we subtract a positive estimated return from a negative delta,
    // producing a more negative (larger outflow) estimate. That's correct: market dropped more than expected.
    const result = deriveMonthSurplus(
      [invest(1, [
        { id: 1, recordedOn: "2025-12-31", amountCents: 100_000 },
        { id: 2, recordedOn: "2026-01-31", amountCents: 94_000 }, // delta = -6_000 (market dropped)
      ])],
      JAN,
    );
    // estimatedReturn = round(100_000 × 500/10_000/12) = round(416.67) = 417
    // surplus = -6_000 - 417 = -6_417
    expect(result.surplusCents).toBeLessThan(-6_000);
    expect(result.confidence).toBe("estimated");
  });

  it("transfer month: cash + investment, cash decreases as investment increases", () => {
    // Transfer 50_000 from cash to brokerage
    // Cash: 200_000 → 150_000. Investment: 100_000 → 150_000
    // Cash delta = -50_000
    // Investment delta = 50_000, estimatedReturn = round(100_000 × 500/10_000/12) = 417
    // Investment cashflow = 50_000 - 417 = 49_583
    // Total = -50_000 + 49_583 = -417 (the market return estimate is the only "leak")
    const result = deriveMonthSurplus(
      [
        cash(1, [
          { id: 1, recordedOn: "2025-12-31", amountCents: 200_000 },
          { id: 2, recordedOn: "2026-01-31", amountCents: 150_000 },
        ]),
        invest(2, [
          { id: 3, recordedOn: "2025-12-31", amountCents: 100_000 },
          { id: 4, recordedOn: "2026-01-31", amountCents: 150_000 },
        ]),
      ],
      JAN,
    );
    // Transfer is internal → net external surplus should be ~0 (small noise from return estimate)
    expect(result.surplusCents).toBe(-417);
    expect(result.confidence).toBe("estimated");
  });

  it("uses latest snapshot at or before range.end, not one after", () => {
    // snapshot on Feb 10 is after JAN.end — should not be used as closing
    // snapshot on Jan 20 should be closing
    const result = deriveMonthSurplus(
      [cash(1, [
        { id: 1, recordedOn: "2025-12-31", amountCents: 100_000 },
        { id: 2, recordedOn: "2026-01-20", amountCents: 112_000 }, // closing
        { id: 3, recordedOn: "2026-02-10", amountCents: 115_000 }, // after range, ignored
      ])],
      JAN,
    );
    expect(result.surplusCents).toBe(12_000);
  });

  it("tie-breaks on snapshot id when same recordedOn", () => {
    // Two snapshots on the same day — higher id wins as closing
    const result = deriveMonthSurplus(
      [cash(1, [
        { id: 1, recordedOn: "2025-12-31", amountCents: 100_000 },
        { id: 2, recordedOn: "2026-01-20", amountCents: 108_000 },
        { id: 3, recordedOn: "2026-01-20", amountCents: 110_000 }, // same date, higher id
      ])],
      JAN,
    );
    expect(result.surplusCents).toBe(10_000);
  });

  it("stale asset: only a snapshot from before the range contributes 0 (opening == closing)", () => {
    // Dec 31 is found as BOTH opening (latest before Feb 1) and closing (latest ≤ Feb 28).
    // Delta = 0 — we have no evidence the balance changed, so contribution is 0.
    const result = deriveMonthSurplus(
      [cash(1, [{ id: 1, recordedOn: "2025-12-31", amountCents: 100_000 }])],
      FEB,
    );
    expect(result.surplusCents).toBe(0);
    expect(result.confidence).toBe("high");
  });

  it("custom defaultAnnualReturnBps scales the return estimate", () => {
    // 1200 bps = 12% annual → 1% monthly
    // Opening 100_000, delta = 2_000
    // estimatedReturn = round(100_000 * 0.12 / 12) = 1_000
    // contribution = 2_000 - 1_000 = 1_000
    const result = deriveMonthSurplus(
      [invest(1, [
        { id: 1, recordedOn: "2025-12-31", amountCents: 100_000 },
        { id: 2, recordedOn: "2026-01-31", amountCents: 102_000 },
      ])],
      JAN,
      1200,
    );
    expect(result.surplusCents).toBe(1_000);
  });
});
