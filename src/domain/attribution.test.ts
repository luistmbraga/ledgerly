import { describe, expect, it } from "vitest";
import { computeAttribution, type AttributionAsset } from "./attribution";

function asset(
  id: number,
  name: string,
  snapshots: { id: number; recordedOn: string; amountCents: number }[],
): AttributionAsset {
  return { id, name, snapshots };
}

describe("computeAttribution", () => {
  it("returns empty when there are no assets or liabilities", () => {
    const result = computeAttribution([], [], "2026-10-31", "2026-11-10");
    expect(result.items).toHaveLength(0);
    expect(result.netWorthDeltaCents).toBe(0);
  });

  it("skips an asset with no snapshot at or before endDate", () => {
    const a = asset(1, "Future asset", [
      { id: 1, recordedOn: "2026-12-01", amountCents: 10_000 },
    ]);
    const result = computeAttribution([a], [], "2026-10-31", "2026-11-10");
    expect(result.items).toHaveLength(0);
    expect(result.netWorthDeltaCents).toBe(0);
  });

  it("computes contribution for a single asset that grew", () => {
    const a = asset(1, "Cash", [
      { id: 1, recordedOn: "2026-10-01", amountCents: 10_000 },
      { id: 2, recordedOn: "2026-11-01", amountCents: 12_000 },
    ]);
    const result = computeAttribution([a], [], "2026-10-31", "2026-11-10");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].startCents).toBe(10_000);
    expect(result.items[0].endCents).toBe(12_000);
    expect(result.items[0].netWorthContributionCents).toBe(2_000);
    expect(result.netWorthDeltaCents).toBe(2_000);
  });

  it("contribution sums exactly to netWorthDeltaCents", () => {
    const a1 = asset(1, "Cash", [
      { id: 1, recordedOn: "2026-10-01", amountCents: 10_000 },
      { id: 2, recordedOn: "2026-11-01", amountCents: 12_000 },
    ]);
    const a2 = asset(2, "Brokerage", [
      { id: 3, recordedOn: "2026-10-01", amountCents: 50_000 },
      { id: 4, recordedOn: "2026-11-01", amountCents: 48_000 },
    ]);
    const l1 = asset(1, "Mortgage", [
      { id: 5, recordedOn: "2026-10-01", amountCents: 200_000 },
      { id: 6, recordedOn: "2026-11-01", amountCents: 199_500 },
    ]);
    const result = computeAttribution([a1, a2], [l1], "2026-10-31", "2026-11-10");
    const sumFromItems = result.items.reduce(
      (s, i) => s + i.netWorthContributionCents,
      0,
    );
    expect(sumFromItems).toBe(result.netWorthDeltaCents);
    // Cash +2000, Brokerage -2000, Mortgage (liability) fell by 500 → net worth +500
    expect(result.netWorthDeltaCents).toBe(500);
  });

  it("marks a new asset (no snapshot at or before startDate) with isNew and startCents null", () => {
    const a = asset(1, "New asset", [
      { id: 1, recordedOn: "2026-11-01", amountCents: 5_000 },
    ]);
    const result = computeAttribution([a], [], "2026-10-31", "2026-11-10");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isNew).toBe(true);
    expect(result.items[0].startCents).toBeNull();
    expect(result.items[0].endCents).toBe(5_000);
    // Contribution = 5000 - 0 = 5000
    expect(result.items[0].netWorthContributionCents).toBe(5_000);
    expect(result.netWorthDeltaCents).toBe(5_000);
  });

  it("includes new asset contribution in netWorthDeltaCents", () => {
    const existing = asset(1, "Cash", [
      { id: 1, recordedOn: "2026-10-01", amountCents: 10_000 },
      { id: 2, recordedOn: "2026-11-01", amountCents: 10_500 },
    ]);
    const newAsset = asset(2, "Brokerage opened mid-period", [
      { id: 3, recordedOn: "2026-11-01", amountCents: 20_000 },
    ]);
    const result = computeAttribution(
      [existing, newAsset],
      [],
      "2026-10-31",
      "2026-11-10",
    );
    // existing: +500, newAsset: +20000
    expect(result.netWorthDeltaCents).toBe(20_500);
    const sumFromItems = result.items.reduce(
      (s, i) => s + i.netWorthContributionCents,
      0,
    );
    expect(sumFromItems).toBe(result.netWorthDeltaCents);
  });

  it("carries forward last known value when no new snapshot in range", () => {
    const a = asset(1, "Real estate", [
      { id: 1, recordedOn: "2026-09-01", amountCents: 300_000 },
    ]);
    const result = computeAttribution([a], [], "2026-10-31", "2026-11-10");
    expect(result.items[0].startCents).toBe(300_000);
    expect(result.items[0].endCents).toBe(300_000);
    expect(result.items[0].netWorthContributionCents).toBe(0);
    expect(result.netWorthDeltaCents).toBe(0);
  });

  it("handles liability correctly: increase reduces net worth", () => {
    const l = asset(1, "Credit card", [
      { id: 1, recordedOn: "2026-10-01", amountCents: 1_000 },
      { id: 2, recordedOn: "2026-11-01", amountCents: 1_500 },
    ]);
    const result = computeAttribution([], [l], "2026-10-31", "2026-11-10");
    expect(result.items[0].netWorthContributionCents).toBe(-500);
    expect(result.netWorthDeltaCents).toBe(-500);
  });

  it("handles liability correctly: decrease increases net worth", () => {
    const l = asset(1, "Mortgage", [
      { id: 1, recordedOn: "2026-10-01", amountCents: 100_000 },
      { id: 2, recordedOn: "2026-11-01", amountCents: 99_000 },
    ]);
    const result = computeAttribution([], [l], "2026-10-31", "2026-11-10");
    expect(result.items[0].netWorthContributionCents).toBe(1_000);
    expect(result.netWorthDeltaCents).toBe(1_000);
  });

  it("sorts items by absolute contribution descending", () => {
    const a1 = asset(1, "Small change", [
      { id: 1, recordedOn: "2026-10-01", amountCents: 1_000 },
      { id: 2, recordedOn: "2026-11-01", amountCents: 1_100 },
    ]);
    const a2 = asset(2, "Big change", [
      { id: 3, recordedOn: "2026-10-01", amountCents: 50_000 },
      { id: 4, recordedOn: "2026-11-01", amountCents: 45_000 },
    ]);
    const result = computeAttribution([a1, a2], [], "2026-10-31", "2026-11-10");
    expect(result.items[0].name).toBe("Big change");
    expect(result.items[1].name).toBe("Small change");
  });

  it("tie-breaks same date by largest snapshot id", () => {
    const a = asset(1, "Account", [
      { id: 1, recordedOn: "2026-10-15", amountCents: 10_000 },
      { id: 5, recordedOn: "2026-10-15", amountCents: 11_000 }, // same date, higher id wins
    ]);
    const result = computeAttribution([a], [], "2026-09-30", "2026-11-10");
    expect(result.items[0].endCents).toBe(11_000);
  });

  it("asset with only one snapshot: startDate equals endDate, contribution is zero", () => {
    const a = asset(1, "Account", [
      { id: 1, recordedOn: "2026-10-01", amountCents: 10_000 },
    ]);
    const result = computeAttribution([a], [], "2026-10-31", "2026-10-31");
    expect(result.items[0].startCents).toBe(10_000);
    expect(result.items[0].endCents).toBe(10_000);
    expect(result.items[0].netWorthContributionCents).toBe(0);
  });

  it("isNew is false when entity has a snapshot exactly on startDate", () => {
    const a = asset(1, "Account", [
      { id: 1, recordedOn: "2026-10-31", amountCents: 10_000 },
      { id: 2, recordedOn: "2026-11-05", amountCents: 10_500 },
    ]);
    const result = computeAttribution([a], [], "2026-10-31", "2026-11-10");
    expect(result.items[0].isNew).toBe(false);
    expect(result.items[0].startCents).toBe(10_000);
  });
});
