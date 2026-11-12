import { describe, expect, it } from "vitest";
import { parseBankAmount, parseBankDate } from "./bank-amount";

const pt = { decimal: "," } as const;
const en = { decimal: "." } as const;

describe("parseBankAmount", () => {
  it.each([
    ["-136,75", -13_675],
    ["5.485,55", 548_555],
    ["-2.027,00", -202_700],
    ["11.707,40", 1_170_740],
    ["425,00", 42_500],
    ["4,5", 450],
    ["12", 1_200],
    ["+3.085,11", 308_511],
    ["1 234,56 €", 123_456],
    ["1 234,56 EUR", 123_456],
    ["(9,74)", -974],
    ["0,00", 0],
    ["-0,00", 0],
    ["6.000.000.000,00", 600_000_000_000],
  ])("reads PT %s", (raw, cents) => {
    expect(parseBankAmount(raw, pt)).toEqual({ ok: true, cents });
  });

  it.each([
    ["-1,234.56", -123_456],
    ["1234.5", 123_450],
  ])("reads EN %s", (raw, cents) => {
    expect(parseBankAmount(raw, en)).toEqual({ ok: true, cents });
  });

  it.each(["", "abc", "12,345", "1.23,45", "12,3a", "--5,00", "(-5,00)", "5,00-", "1.2345,00", "12.50"])(
    "rejects PT %j",
    (raw) => {
      expect(parseBankAmount(raw, pt)).toEqual({ ok: false });
    },
  );

  it("rejects amounts beyond safe integer cents", () => {
    expect(parseBankAmount("99999999999999999999,00", pt)).toEqual({ ok: false });
  });
});

describe("parseBankDate", () => {
  it("converts statement formats to ISO", () => {
    expect(parseBankDate("09-11-2026", "DD-MM-YYYY")).toBe("2026-11-09");
    expect(parseBankDate("29/02/2028", "DD/MM/YYYY")).toBe("2028-02-29");
    expect(parseBankDate("2026-11-09", "YYYY-MM-DD")).toBe("2026-11-09");
  });

  it("rejects impossible or mismatched dates", () => {
    expect(parseBankDate("31-02-2026", "DD-MM-YYYY")).toBeNull();
    expect(parseBankDate("29/02/2026", "DD/MM/YYYY")).toBeNull();
    expect(parseBankDate("09/11/2026", "DD-MM-YYYY")).toBeNull();
    expect(parseBankDate("2026-13-01", "YYYY-MM-DD")).toBeNull();
    expect(parseBankDate("9-11-2026", "DD-MM-YYYY")).toBeNull();
  });
});
