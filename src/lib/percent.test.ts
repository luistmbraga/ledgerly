import { describe, expect, it } from "vitest";
import {
  bpsToPercentInput,
  formatBps,
  formatRatio,
  parseAnnualRatePercent,
  ratioToVisualPercent,
} from "./percent";

describe("formatRatio", () => {
  it("returns null for null", () => expect(formatRatio(null)).toBeNull());
  it("returns null for Infinity", () => expect(formatRatio(Infinity)).toBeNull());
  it("returns null for NaN", () => expect(formatRatio(NaN)).toBeNull());
  it("returns '0%' for 0", () => expect(formatRatio(0)).toBe("0%"));
  it("returns '0%' for negative", () => expect(formatRatio(-0.1)).toBe("0%"));
  it("returns '100%' for 1", () => expect(formatRatio(1)).toBe("100%"));
  it("returns '100%' for values > 1", () => expect(formatRatio(1.5)).toBe("100%"));
  it("never returns '100%' for ratio < 1", () => expect(formatRatio(0.9999)).not.toBe("100%"));
  it("formats 0.9999 as '99.9%'", () => expect(formatRatio(0.9999)).toBe("99.9%"));
  it("formats 0.5 as '50%'", () => expect(formatRatio(0.5)).toBe("50%"));
  it("formats 0.505 as '50.5%'", () => expect(formatRatio(0.505)).toBe("50.5%"));
  it("formats 0.1 as '10%'", () => expect(formatRatio(0.1)).toBe("10%"));
  it("formats 0.333 as '33.3%'", () => expect(formatRatio(0.333)).toBe("33.3%"));
  it("formats 0.015 as '1.5%'", () => expect(formatRatio(0.015)).toBe("1.5%"));
  it("formats 0.2 as '20%' (whole number, no decimal)", () => expect(formatRatio(0.2)).toBe("20%"));
});

describe("ratioToVisualPercent", () => {
  it("returns 0 for 0", () => expect(ratioToVisualPercent(0)).toBe(0));
  it("returns 100 for 1", () => expect(ratioToVisualPercent(1)).toBe(100));
  it("returns 51 for 0.505", () => expect(ratioToVisualPercent(0.505)).toBe(51));
  it("clamps below 0", () => expect(ratioToVisualPercent(-0.1)).toBe(0));
  it("clamps above 100", () => expect(ratioToVisualPercent(1.5)).toBe(100));
  it("returns integer", () => expect(Number.isInteger(ratioToVisualPercent(0.333))).toBe(true));
});

describe("formatBps", () => {
  it("returns null for null", () => expect(formatBps(null)).toBeNull());
  it("returns null for NaN", () => expect(formatBps(NaN)).toBeNull());
  it("formats 300 as '3%'", () => expect(formatBps(300)).toBe("3%"));
  it("formats 1000 as '10%'", () => expect(formatBps(1000)).toBe("10%"));
  it("formats 1250 as '12.5%'", () => expect(formatBps(1250)).toBe("12.5%"));
  it("formats 0 as '0%'", () => expect(formatBps(0)).toBe("0%"));
  it("formats 10000 as '100%'", () => expect(formatBps(10000)).toBe("100%"));
  it("formats 550 as '5.5%'", () => expect(formatBps(550)).toBe("5.5%"));
});

describe("parseAnnualRatePercent", () => {
  it("treats blank as not recorded", () => expect(parseAnnualRatePercent("  ")).toEqual({ ok: true, bps: null }));
  it("parses whole and decimal percents", () => {
    expect(parseAnnualRatePercent("3")).toEqual({ ok: true, bps: 300 });
    expect(parseAnnualRatePercent("2.5")).toEqual({ ok: true, bps: 250 });
    expect(parseAnnualRatePercent("0.05")).toEqual({ ok: true, bps: 5 });
    expect(parseAnnualRatePercent("0")).toEqual({ ok: true, bps: 0 });
    expect(parseAnnualRatePercent("100")).toEqual({ ok: true, bps: 10_000 });
  });
  it("rejects bad input and rates above 100", () => {
    for (const bad of ["-1", "abc", "1.234", "3%", "100.01", "1,5"]) {
      expect(parseAnnualRatePercent(bad).ok).toBe(false);
    }
  });
});

describe("bpsToPercentInput", () => {
  it("round-trips with the parser", () => {
    for (const bps of [0, 5, 250, 300, 1_850, 10_000]) {
      const parsed = parseAnnualRatePercent(bpsToPercentInput(bps));
      expect(parsed).toEqual({ ok: true, bps });
    }
  });
  it("is blank for null", () => expect(bpsToPercentInput(null)).toBe(""));
});
