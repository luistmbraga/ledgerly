import { describe, expect, it } from "vitest";
import {
  ASSET_TYPES,
  computeNetWorth,
  computeNetWorthSeries,
  selectLatestSnapshot,
  type DatedSnapshot,
} from "./net-worth";

function snapshot(
  id: number,
  recordedOn: string,
  amountCents: number,
): DatedSnapshot {
  return { id, recordedOn, amountCents };
}

describe("selectLatestSnapshot", () => {
  it("returns null when there are no snapshots", () => {
    expect(selectLatestSnapshot([])).toBeNull();
  });

  it("picks the only snapshot", () => {
    const only = snapshot(4, "2026-04-01", 900);
    expect(selectLatestSnapshot([only])).toBe(only);
  });

  it("picks the maximum recorded date", () => {
    const older = snapshot(9, "2026-01-01", 50_000);
    const newer = snapshot(2, "2026-06-01", 10_000);
    expect(selectLatestSnapshot([older, newer])).toBe(newer);
    expect(selectLatestSnapshot([newer, older])).toBe(newer);
  });

  it("tie-breaks the same date by the largest id", () => {
    const lowerId = snapshot(3, "2026-03-01", 80_000);
    const higherId = snapshot(8, "2026-03-01", 12_500);
    expect(selectLatestSnapshot([lowerId, higherId])?.id).toBe(8);
    expect(selectLatestSnapshot([higherId, lowerId])?.amountCents).toBe(12_500);
  });

  it("does not let a larger id on an older date win", () => {
    const oldLargeId = snapshot(100, "2025-12-31", 999_900);
    const newSmallId = snapshot(1, "2026-01-01", 100);
    expect(selectLatestSnapshot([oldLargeId, newSmallId])).toBe(newSmallId);
  });
});

describe("computeNetWorth", () => {
  it("returns zero totals and a zero amount for every asset type when empty", () => {
    const result = computeNetWorth([], []);
    expect(result.totalAssetsCents).toBe(0);
    expect(result.totalLiabilitiesCents).toBe(0);
    expect(result.netWorthCents).toBe(0);
    expect(Object.keys(result.byAssetType).sort()).toEqual(
      [...ASSET_TYPES].sort(),
    );
    for (const type of ASSET_TYPES) {
      expect(result.byAssetType[type]).toBe(0);
    }
  });

  it("subtracts liabilities from assets", () => {
    const result = computeNetWorth(
      [
        { type: "cash", latestAmountCents: 25_050 },
        { type: "brokerage", latestAmountCents: 100_000 },
      ],
      [{ latestAmountCents: 4_000 }],
    );
    expect(result.totalAssetsCents).toBe(125_050);
    expect(result.totalLiabilitiesCents).toBe(4_000);
    expect(result.netWorthCents).toBe(121_050);
    expect(result.byAssetType.cash).toBe(25_050);
    expect(result.byAssetType.brokerage).toBe(100_000);
    expect(result.byAssetType.crypto).toBe(0);
  });

  it("treats a missing snapshot as zero and still groups by type", () => {
    const result = computeNetWorth(
      [
        { type: "cash", latestAmountCents: null },
        { type: "cash", latestAmountCents: 500 },
        { type: "vehicle", latestAmountCents: null },
      ],
      [{ latestAmountCents: null }, { latestAmountCents: 2_000 }],
    );
    expect(result.totalAssetsCents).toBe(500);
    expect(result.totalLiabilitiesCents).toBe(2_000);
    expect(result.netWorthCents).toBe(-1_500);
    expect(result.byAssetType.cash).toBe(500);
    expect(result.byAssetType.vehicle).toBe(0);
  });

  it("sums several liabilities and assets of the same type", () => {
    const result = computeNetWorth(
      [
        { type: "real_estate", latestAmountCents: 1_000 },
        { type: "real_estate", latestAmountCents: 2_500 },
      ],
      [{ latestAmountCents: 100 }, { latestAmountCents: 50 }],
    );
    expect(result.byAssetType.real_estate).toBe(3_500);
    expect(result.totalLiabilitiesCents).toBe(150);
    expect(result.netWorthCents).toBe(3_350);
  });
});

describe("computeNetWorthSeries", () => {
  it("returns empty when there are no snapshots", () => {
    expect(computeNetWorthSeries([], [], "2026-11-10")).toEqual([]);
  });

  it("returns a single point when snapshots are only in the current month", () => {
    const series = computeNetWorthSeries(
      [{ snapshots: [{ id: 1, recordedOn: "2026-11-01", amountCents: 10_000 }] }],
      [],
      "2026-11-10",
    );
    expect(series).toHaveLength(1);
    expect(series[0].date).toBe("2026-11-10");
    expect(series[0].netWorthCents).toBe(10_000);
  });

  it("caps the last point at asOfDate when it falls mid-month", () => {
    const series = computeNetWorthSeries(
      [{ snapshots: [{ id: 1, recordedOn: "2026-10-01", amountCents: 5_000 }] }],
      [],
      "2026-10-15",
    );
    expect(series).toHaveLength(1);
    expect(series[0].date).toBe("2026-10-15");
  });

  it("produces a month-end date when asOfDate is itself a month-end", () => {
    const series = computeNetWorthSeries(
      [{ snapshots: [{ id: 1, recordedOn: "2026-10-01", amountCents: 5_000 }] }],
      [],
      "2026-10-31",
    );
    expect(series[0].date).toBe("2026-10-31");
  });

  it("returns two points when snapshots span two calendar months", () => {
    const series = computeNetWorthSeries(
      [
        {
          snapshots: [
            { id: 1, recordedOn: "2026-10-15", amountCents: 10_000 },
            { id: 2, recordedOn: "2026-11-05", amountCents: 11_000 },
          ],
        },
      ],
      [],
      "2026-11-10",
    );
    expect(series).toHaveLength(2);
    expect(series[0].date).toBe("2026-10-31");
    expect(series[0].netWorthCents).toBe(10_000);
    expect(series[1].date).toBe("2026-11-10");
    expect(series[1].netWorthCents).toBe(11_000);
  });

  it("carries forward the last known value for months without a snapshot", () => {
    const series = computeNetWorthSeries(
      [
        {
          snapshots: [
            { id: 1, recordedOn: "2026-09-20", amountCents: 10_000 },
            { id: 2, recordedOn: "2026-11-01", amountCents: 12_000 },
          ],
        },
      ],
      [],
      "2026-11-10",
    );
    expect(series).toHaveLength(3);
    expect(series[0].date).toBe("2026-09-30");
    expect(series[0].netWorthCents).toBe(10_000);
    expect(series[1].date).toBe("2026-10-31");
    expect(series[1].netWorthCents).toBe(10_000); // carry forward
    expect(series[2].date).toBe("2026-11-10");
    expect(series[2].netWorthCents).toBe(12_000);
  });

  it("shows 0 for an asset before its first snapshot (no retroactive distortion)", () => {
    const series = computeNetWorthSeries(
      [
        { snapshots: [{ id: 1, recordedOn: "2026-09-01", amountCents: 10_000 }] },
        { snapshots: [{ id: 2, recordedOn: "2026-11-01", amountCents: 5_000 }] },
      ],
      [],
      "2026-11-10",
    );
    expect(series).toHaveLength(3);
    expect(series[0].netWorthCents).toBe(10_000); // Sep: only first asset
    expect(series[1].netWorthCents).toBe(10_000); // Oct: only first asset
    expect(series[2].netWorthCents).toBe(15_000); // Nov: both assets
  });

  it("subtracts liabilities correctly at each point", () => {
    const series = computeNetWorthSeries(
      [{ snapshots: [{ id: 1, recordedOn: "2026-10-01", amountCents: 50_000 }] }],
      [{ snapshots: [{ id: 2, recordedOn: "2026-10-01", amountCents: 10_000 }] }],
      "2026-10-31",
    );
    expect(series).toHaveLength(1);
    expect(series[0].totalAssetsCents).toBe(50_000);
    expect(series[0].totalLiabilitiesCents).toBe(10_000);
    expect(series[0].netWorthCents).toBe(40_000);
  });

  it("spans a year boundary correctly", () => {
    const series = computeNetWorthSeries(
      [
        {
          snapshots: [
            { id: 1, recordedOn: "2025-12-01", amountCents: 100_000 },
            { id: 2, recordedOn: "2026-01-05", amountCents: 105_000 },
          ],
        },
      ],
      [],
      "2026-01-31",
    );
    expect(series).toHaveLength(2);
    expect(series[0].date).toBe("2025-12-31");
    expect(series[0].netWorthCents).toBe(100_000);
    expect(series[1].date).toBe("2026-01-31");
    expect(series[1].netWorthCents).toBe(105_000);
  });
});
