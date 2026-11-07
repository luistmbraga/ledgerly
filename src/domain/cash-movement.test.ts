import { describe, expect, it } from "vitest";
import { nextCashCents } from "./cash-movement";

describe("nextCashCents", () => {
  it("adds income to the latest balance", () => {
    expect(nextCashCents(10_000, "income", 2_500)).toEqual({
      ok: true,
      amountCents: 12_500,
    });
  });

  it("subtracts an expense from the latest balance", () => {
    expect(nextCashCents(10_000, "expense", 2_500)).toEqual({
      ok: true,
      amountCents: 7_500,
    });
  });

  it("treats a zero base as the starting balance for income", () => {
    expect(nextCashCents(0, "income", 5_000)).toEqual({
      ok: true,
      amountCents: 5_000,
    });
  });

  it("allows an expense that brings the balance to zero", () => {
    expect(nextCashCents(5_000, "expense", 5_000)).toEqual({
      ok: true,
      amountCents: 0,
    });
  });

  it("rejects an expense that would make the balance negative", () => {
    expect(nextCashCents(1_000, "expense", 1_001)).toEqual({
      ok: false,
      reason: "negative_balance",
    });
  });

  it("rejects an expense against a zero base", () => {
    expect(nextCashCents(0, "expense", 1)).toEqual({
      ok: false,
      reason: "negative_balance",
    });
  });
});
