import { describe, expect, it } from "vitest";
import { checkTradeFee, feeNote, parseTradeFee, resolveImportedAmount } from "./import-fee";

describe("trade fee split", () => {
  it("accepts a fee below the trade amount, typed with a dot or a comma", () => {
    expect(parseTradeFee("1.07", 150_107)).toEqual({ ok: true, cents: 107 });
    expect(parseTradeFee(" 1,07 ", 150_107)).toEqual({ ok: true, cents: 107 });
    expect(parseTradeFee("1", 150_107)).toEqual({ ok: true, cents: 100 });
  });

  it("rejects zero, negative, malformed and too-large fees", () => {
    expect(parseTradeFee("0", 150_107)).toMatchObject({ ok: false, error: "Enter a fee above zero." });
    expect(parseTradeFee("-1", 150_107).ok).toBe(false);
    expect(parseTradeFee("1.075", 150_107).ok).toBe(false);
    expect(parseTradeFee("", 150_107).ok).toBe(false);
    expect(parseTradeFee("1501.07", 150_107)).toMatchObject({
      ok: false,
      error: "The fee must be less than the trade amount.",
    });
    expect(checkTradeFee(1.5, 150_107).ok).toBe(false);
  });

  it("builds a note that stays within the note limit", () => {
    expect(feeNote("Buy trade IE0000VITHT2")).toBe("Fee: Buy trade IE0000VITHT2");
    expect(feeNote("x".repeat(600))).toHaveLength(500);
  });
});

describe("resolveImportedAmount", () => {
  const trade = { kind: "expense" as const, amountCents: 150_107, flagType: "investment_trade" };

  it("imports the row as it is when there is no fee", () => {
    expect(resolveImportedAmount({ ...trade, feeCents: undefined })).toEqual({
      ok: true,
      kind: "expense",
      amountCents: 150_107,
    });
  });

  it("imports only the fee, as an expense, for buy and sell trades", () => {
    expect(resolveImportedAmount({ ...trade, feeCents: 107 })).toEqual({ ok: true, kind: "expense", amountCents: 107 });
    expect(resolveImportedAmount({ ...trade, kind: "income", feeCents: 100 })).toEqual({
      ok: true,
      kind: "expense",
      amountCents: 100,
    });
  });

  it("refuses a fee on rows that aren't investment trades, or one that is too large", () => {
    expect(resolveImportedAmount({ ...trade, flagType: "own_transfer", feeCents: 107 }).ok).toBe(false);
    expect(resolveImportedAmount({ ...trade, flagType: null, feeCents: 107 }).ok).toBe(false);
    expect(resolveImportedAmount({ ...trade, feeCents: 150_107 }).ok).toBe(false);
  });
});
