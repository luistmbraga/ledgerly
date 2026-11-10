import { describe, expect, it } from "vitest";
import {
  computeRunway,
  projectEmergencyFundClose,
  projectNetWorth,
} from "./projection";

describe("projectNetWorth", () => {
  it("grows linearly with zero return", () => {
    // 0 start, +100/month × 12 = 1200
    const milestones = projectNetWorth(0, 100, 0, [1]);
    expect(milestones).toHaveLength(1);
    expect(milestones[0].years).toBe(1);
    expect(milestones[0].netWorthCents).toBe(1200);
  });

  it("returns milestones at correct year marks", () => {
    const milestones = projectNetWorth(0, 100, 0, [1, 3, 5]);
    expect(milestones.map((m) => m.years)).toEqual([1, 3, 5]);
    expect(milestones[0].netWorthCents).toBe(1200);
    expect(milestones[1].netWorthCents).toBe(3600);
    expect(milestones[2].netWorthCents).toBe(6000);
  });

  it("compounds with a positive return and no contributions", () => {
    // 100_000 start, 0 surplus, 1200 bps (1%/month)
    // after 12 months ≈ 100_000 × 1.01^12 ≈ 112_682
    const [m] = projectNetWorth(100_000, 0, 1200, [1]);
    expect(m.netWorthCents).toBeGreaterThan(100_000);
    expect(m.netWorthCents).toBeGreaterThan(112_000);
    expect(m.netWorthCents).toBeLessThan(113_000);
  });

  it("handles negative surplus (net outflow)", () => {
    // 1200 start, -100/month × 12 → 0
    const [m] = projectNetWorth(1200, -100, 0, [1]);
    expect(m.netWorthCents).toBe(0);
  });

  it("produces a single milestone for a single horizon year", () => {
    expect(projectNetWorth(0, 50, 0, [5])).toHaveLength(1);
    expect(projectNetWorth(0, 50, 0, [5])[0].years).toBe(5);
  });

  it("throws ValidationError for negative returnBps", () => {
    expect(() => projectNetWorth(0, 100, -1, [1])).toThrow(
      "returnBps must be non-negative",
    );
    expect(() => projectNetWorth(0, 100, -1, [1])).toThrow(
      expect.objectContaining({ name: "ValidationError" }),
    );
  });

  it("matches hand-computed annuity at 4% annual over 1 year with contributions", () => {
    // 0 start, 100/month, 400 bps (≈ 0.3333%/month)
    // month 1: round(0 × 1.003333) + 100 = 100
    // month 2: round(100 × 1.003333) + 100 = 200
    // ... accumulates with compound rounding
    const [m] = projectNetWorth(0, 100, 400, [1]);
    // Result should be more than linear (1200) due to compounding
    expect(m.netWorthCents).toBeGreaterThan(1200);
    // But only slightly for 4% annual
    expect(m.netWorthCents).toBeLessThan(1230);
  });
});

describe("projectEmergencyFundClose", () => {
  it("returns null when gap is already zero", () => {
    expect(projectEmergencyFundClose(0, 500, "2026-01-01")).toBeNull();
  });

  it("returns null when surplus is zero", () => {
    expect(projectEmergencyFundClose(5000, 0, "2026-01-01")).toBeNull();
  });

  it("returns null when surplus is negative", () => {
    expect(projectEmergencyFundClose(5000, -100, "2026-01-01")).toBeNull();
  });

  it("computes close date and months correctly", () => {
    // gap 1000, surplus 100/month → 10 months
    const result = projectEmergencyFundClose(1000, 100, "2026-01-01");
    expect(result).not.toBeNull();
    expect(result!.monthsToClose).toBe(10);
    expect(result!.closeDate).toBe("2026-11-01");
  });

  it("rounds up partial months", () => {
    // gap 1050, surplus 100 → ceil(10.5) = 11 months
    const result = projectEmergencyFundClose(1050, 100, "2026-01-01");
    expect(result!.monthsToClose).toBe(11);
    expect(result!.closeDate).toBe("2026-12-01");
  });

  it("works when gap exactly divides surplus", () => {
    const result = projectEmergencyFundClose(600, 200, "2026-06-15");
    expect(result!.monthsToClose).toBe(3);
    expect(result!.closeDate).toBe("2026-09-15");
  });
});

describe("computeRunway", () => {
  it("returns null when essential spend is zero", () => {
    expect(computeRunway(100_000, 0)).toBeNull();
  });

  it("returns null when essential spend is negative", () => {
    expect(computeRunway(100_000, -50)).toBeNull();
  });

  it("returns 0 months when net worth is zero", () => {
    expect(computeRunway(0, 100_000)).toEqual({ months: 0 });
  });

  it("returns 0 months when net worth is negative", () => {
    expect(computeRunway(-500, 100_000)).toEqual({ months: 0 });
  });

  it("computes runway in months by floor division", () => {
    // 1_200_000 cents (€12,000) / 100_000 cents (€1,000) = 12 months
    expect(computeRunway(1_200_000, 100_000)).toEqual({ months: 12 });
  });

  it("floors partial months", () => {
    // 1050 / 100 = 10.5 → 10 months
    expect(computeRunway(1050, 100)).toEqual({ months: 10 });
  });

  it("handles large values without overflow", () => {
    // 1,000,000 EUR / 3,000 EUR/month ≈ 333 months
    const result = computeRunway(100_000_000_00, 300_000);
    expect(result!.months).toBe(33333);
  });
});
