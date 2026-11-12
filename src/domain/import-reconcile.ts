export type ReconcileRow = { amountCents: number | null; balanceCents: number | null };

export type Reconciliation =
  | { status: "unavailable" }
  | {
      status: "ok";
      openingBalanceCents: number;
      closingMatches: boolean | null;
    }
  | {
      status: "broken";
      /** 1-based chronological position of the first row that does not follow. */
      position: number;
      differenceCents: number;
    }
  | {
      status: "closing_mismatch";
      openingBalanceCents: number;
      differenceCents: number;
    };

/**
 * Checks `previous balance + amount = balance` along a chronological running-balance
 * chain, then that the last balance equals the statement's closing balance.
 */
export function reconcileRunningBalance(
  rows: readonly ReconcileRow[],
  closingBalanceCents: number | null,
): Reconciliation {
  if (rows.length === 0) return { status: "unavailable" };
  if (rows.some((row) => row.amountCents === null || row.balanceCents === null)) {
    return { status: "unavailable" };
  }
  const chain = rows as ReadonlyArray<{ amountCents: number; balanceCents: number }>;

  for (let i = 1; i < chain.length; i += 1) {
    const expected = chain[i - 1].balanceCents + chain[i].amountCents;
    if (expected !== chain[i].balanceCents) {
      return { status: "broken", position: i + 1, differenceCents: chain[i].balanceCents - expected };
    }
  }

  const openingBalanceCents = chain[0].balanceCents - chain[0].amountCents;
  const last = chain[chain.length - 1].balanceCents;
  if (closingBalanceCents !== null && closingBalanceCents !== last) {
    return { status: "closing_mismatch", openingBalanceCents, differenceCents: closingBalanceCents - last };
  }
  return {
    status: "ok",
    openingBalanceCents,
    closingMatches: closingBalanceCents === null ? null : true,
  };
}
