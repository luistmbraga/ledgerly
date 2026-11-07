export type CashflowLine = {
  amountCents: number;
  occurredOn: string;
};

/** Inclusive calendar dates, `YYYY-MM-DD`. */
export type DateRange = {
  start: string;
  end: string;
};

export type CashflowSum = {
  incomeCents: number;
  expenseCents: number;
  surplusCents: number;
  /** surplusCents / incomeCents when income is positive; otherwise null. */
  savingsRate: number | null;
};

export function inRange(occurredOn: string, range: DateRange): boolean {
  return occurredOn >= range.start && occurredOn <= range.end;
}

export function ratio(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return part / whole;
}

function sumInRange(
  lines: readonly CashflowLine[],
  range: DateRange,
): number {
  let total = 0;
  for (const line of lines) {
    if (inRange(line.occurredOn, range)) total += line.amountCents;
  }
  return total;
}

export function sumCashflow(
  entries: {
    incomes: readonly CashflowLine[];
    expenses: readonly CashflowLine[];
  },
  range: DateRange,
): CashflowSum {
  const incomeCents = sumInRange(entries.incomes, range);
  const expenseCents = sumInRange(entries.expenses, range);
  const surplusCents = incomeCents - expenseCents;
  return {
    incomeCents,
    expenseCents,
    surplusCents,
    savingsRate: incomeCents > 0 ? surplusCents / incomeCents : null,
  };
}
