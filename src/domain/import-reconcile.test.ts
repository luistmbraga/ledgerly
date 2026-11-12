import { describe, expect, it } from "vitest";
import { reconcileRunningBalance } from "./import-reconcile";

const rows = [
  { amountCents: -1_000, balanceCents: 9_000 },
  { amountCents: 500, balanceCents: 9_500 },
];

describe("reconcileRunningBalance", () => {
  it("checks the first row against a printed opening balance", () => {
    expect(reconcileRunningBalance(rows, 9_500, 10_000)).toMatchObject({ status: "ok", openingBalanceCents: 10_000 });
    expect(reconcileRunningBalance(rows, 9_500, 10_001)).toEqual({ status: "broken", position: 1, differenceCents: -1 });
  });

  it("derives the opening balance when none is printed", () => {
    expect(reconcileRunningBalance(rows, null)).toMatchObject({ status: "ok", openingBalanceCents: 10_000, closingMatches: null });
  });

  it("reports a closing mismatch and an unreadable chain", () => {
    expect(reconcileRunningBalance(rows, 9_400)).toMatchObject({ status: "closing_mismatch", differenceCents: -100 });
    expect(reconcileRunningBalance([{ amountCents: null, balanceCents: 1 }], null)).toEqual({ status: "unavailable" });
    expect(reconcileRunningBalance([], null)).toEqual({ status: "unavailable" });
  });
});
