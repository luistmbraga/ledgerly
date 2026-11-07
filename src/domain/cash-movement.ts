export type CashDirection = "expense" | "income";

export type NextCashResult =
  | { ok: true; amountCents: number }
  | { ok: false; reason: "negative_balance" };

/** Next cash balance after applying a journal amount to the latest snapshot. */
export function nextCashCents(
  latestCents: number,
  direction: CashDirection,
  amountCents: number,
): NextCashResult {
  const next =
    direction === "income"
      ? latestCents + amountCents
      : latestCents - amountCents;
  if (next < 0) {
    return { ok: false, reason: "negative_balance" };
  }
  return { ok: true, amountCents: next };
}
