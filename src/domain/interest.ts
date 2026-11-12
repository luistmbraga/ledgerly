/**
 * Simple yearly interest from recorded account rates. Uses each account's
 * latest balance; no compounding, no tax. Accounts without a rate are skipped.
 */

export type InterestAccount = {
  name: string;
  balanceCents: number;
  /** Null when no rate is recorded. */
  annualRateBps: number | null;
};

export type InterestSummary = {
  /** Interest the rated assets would earn in a year at today's balances. */
  earnedPerYearCents: number;
  ratedAssetCents: number;
  /** Balance-weighted rate across rated assets. Null when none have a balance. */
  weightedAssetRateBps: number | null;
  /** Interest the rated liabilities would cost in a year at today's balances. */
  costPerYearCents: number;
  ratedLiabilityCents: number;
  weightedLiabilityRateBps: number | null;
};

/** `balance × bps / 10000`, rounded to the nearest cent. Inputs are non-negative. */
export function yearlyInterestCents(balanceCents: number, annualRateBps: number): number {
  return Math.round((balanceCents * annualRateBps) / 10_000);
}

function sumRated(accounts: readonly InterestAccount[]) {
  let balance = 0;
  let interest = 0;
  let weighted = 0;
  for (const account of accounts) {
    if (account.annualRateBps === null || account.balanceCents <= 0) continue;
    balance += account.balanceCents;
    interest += yearlyInterestCents(account.balanceCents, account.annualRateBps);
    weighted += account.balanceCents * account.annualRateBps;
  }
  return {
    balance,
    interest,
    rateBps: balance > 0 ? Math.round(weighted / balance) : null,
  };
}

export function summarizeInterest(
  assets: readonly InterestAccount[],
  liabilities: readonly InterestAccount[],
): InterestSummary {
  const a = sumRated(assets);
  const l = sumRated(liabilities);
  return {
    earnedPerYearCents: a.interest,
    ratedAssetCents: a.balance,
    weightedAssetRateBps: a.rateBps,
    costPerYearCents: l.interest,
    ratedLiabilityCents: l.balance,
    weightedLiabilityRateBps: l.rateBps,
  };
}
