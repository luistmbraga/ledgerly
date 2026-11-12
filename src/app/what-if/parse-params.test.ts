import { describe, expect, it } from "vitest";
import { parseWhatIfParams, type WhatIfParseContext } from "./parse-params";

const CONTEXT: WhatIfParseContext = {
  percentAvailable: true,
  liabilities: [
    { id: 7, balanceCents: 12_000_000 },
    { id: 8, balanceCents: 0 },
    { id: 9, balanceCents: 500_000, annualRateBps: 1_850 },
  ],
};

describe("parseWhatIfParams", () => {
  it("returns empty adjustments for no parameters", () => {
    const result = parseWhatIfParams({}, CONTEXT);
    expect(result.errors).toEqual({});
    expect(result.adjustments).toEqual({
      income: null,
      spending: null,
      oneOffCents: 0,
      debt: null,
    });
  });

  it("parses signed amounts and percents", () => {
    const result = parseWhatIfParams(
      {
        income: "10",
        incomeMode: "pct",
        spend: "-150.50",
        spendMode: "amt",
        oneoff: "+2000",
      },
      CONTEXT,
    );
    expect(result.errors).toEqual({});
    expect(result.adjustments).toEqual({
      income: { kind: "percent", bps: 1000 },
      spending: { kind: "amount", cents: -15_050 },
      oneOffCents: 200_000,
      debt: null,
    });
  });

  it("parses fractional percents without float drift", () => {
    const result = parseWhatIfParams(
      { spend: "-7.5", spendMode: "pct", income: "0.07", incomeMode: "pct" },
      CONTEXT,
    );
    expect(result.adjustments?.spending).toEqual({ kind: "percent", bps: -750 });
    expect(result.adjustments?.income).toEqual({ kind: "percent", bps: 7 });
  });

  it("treats a zero change as no change", () => {
    const result = parseWhatIfParams({ income: "0", spend: "0", spendMode: "pct" }, CONTEXT);
    expect(result.adjustments?.income).toBeNull();
    expect(result.adjustments?.spending).toBeNull();
  });

  it("parses the debt lever against the chosen liability", () => {
    const result = parseWhatIfParams({ debt: "7", extra: "200", rate: "3.25" }, CONTEXT);
    expect(result.errors).toEqual({});
    expect(result.adjustments?.debt).toEqual({
      balanceCents: 12_000_000,
      extraMonthlyCents: 20_000,
      annualRateBps: 325,
    });
  });

  it("ignores a selected liability when no payment or rate is entered", () => {
    const result = parseWhatIfParams({ debt: "7" }, CONTEXT);
    expect(result.errors).toEqual({});
    expect(result.adjustments?.debt).toBeNull();
  });

  it("reports each missing debt field", () => {
    expect(parseWhatIfParams({ extra: "200" }, CONTEXT).errors).toEqual({
      debt: "Choose the liability to overpay.",
      rate: "Enter the annual interest rate.",
    });
    expect(parseWhatIfParams({ debt: "7", rate: "3" }, CONTEXT).errors).toEqual({
      extra: "Enter the extra monthly payment.",
    });
    expect(parseWhatIfParams({ debt: "8", extra: "50", rate: "3" }, CONTEXT).errors).toEqual({
      debt: "This liability has no balance to pay down.",
    });
    expect(parseWhatIfParams({ debt: "99", extra: "50", rate: "3" }, CONTEXT).errors.debt).toBe(
      "Choose the liability to overpay.",
    );
  });

  it("rejects out-of-range and malformed values, keeping the typed text", () => {
    const result = parseWhatIfParams(
      {
        income: "ten",
        spend: "-150",
        spendMode: "pct",
        oneoff: "1.234",
        debt: "7",
        extra: "-5",
        rate: "101",
      },
      CONTEXT,
    );
    expect(result.adjustments).toBeNull();
    expect(Object.keys(result.errors).sort()).toEqual([
      "extra",
      "income",
      "oneoff",
      "rate",
      "spend",
    ]);
    expect(result.values.income).toBe("ten");
    expect(result.values.oneoff).toBe("1.234");
  });

  it("rejects percent mode when the averages are unknown", () => {
    const result = parseWhatIfParams(
      { income: "10", incomeMode: "pct" },
      { ...CONTEXT, percentAvailable: false },
    );
    expect(result.adjustments).toBeNull();
    expect(result.errors.income).toMatch(/Enter an amount instead/);
  });

  it("uses the first value of a repeated parameter", () => {
    const result = parseWhatIfParams({ oneoff: ["100", "999"] }, CONTEXT);
    expect(result.adjustments?.oneOffCents).toBe(10_000);
  });

  it("uses the liability's saved rate when no rate is typed", () => {
    const result = parseWhatIfParams({ debt: "9", extra: "100" }, CONTEXT);
    expect(result.errors).toEqual({});
    expect(result.adjustments?.debt).toEqual({
      balanceCents: 500_000,
      extraMonthlyCents: 10_000,
      annualRateBps: 1_850,
    });
  });

  it("lets a typed rate override the saved one", () => {
    const result = parseWhatIfParams({ debt: "9", extra: "100", rate: "5" }, CONTEXT);
    expect(result.adjustments?.debt?.annualRateBps).toBe(500);
  });
});
