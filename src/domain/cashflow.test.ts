import { describe, expect, it } from "vitest";
import { sumCashflow, type CashflowLine, type DateRange } from "./cashflow";

const range: DateRange = { start: "2026-01-01", end: "2026-01-31" };

const incomes: CashflowLine[] = [
  { amountCents: 100_000, occurredOn: "2026-01-01" },
  { amountCents: 100_000, occurredOn: "2026-01-15" },
  { amountCents: 50_000, occurredOn: "2026-02-01" },
  { amountCents: 20_000, occurredOn: "2025-12-31" },
];

const expenses: CashflowLine[] = [
  { amountCents: 25_000, occurredOn: "2026-01-31" },
  { amountCents: 10_000, occurredOn: "2026-01-15" },
  { amountCents: 80_000, occurredOn: "2026-02-01" },
  { amountCents: 5_000, occurredOn: "2025-12-01" },
];

describe("sumCashflow", () => {
  it("sums income and expenses inside an inclusive date range", () => {
    const result = sumCashflow({ incomes, expenses }, range);
    expect(result.incomeCents).toBe(200_000);
    expect(result.expenseCents).toBe(35_000);
    expect(result.surplusCents).toBe(165_000);
    expect(result.savingsRate).toBe(165_000 / 200_000);
  });

  it("keeps the same totals when lines are listed in another order", () => {
    const result = sumCashflow(
      {
        incomes: [...incomes].reverse(),
        expenses: [...expenses].reverse(),
      },
      range,
    );
    expect(result.incomeCents).toBe(200_000);
    expect(result.expenseCents).toBe(35_000);
    expect(result.surplusCents).toBe(165_000);
  });

  it("returns a negative surplus and a negative savings rate when spending exceeds income", () => {
    const result = sumCashflow(
      {
        incomes: [{ amountCents: 40_000, occurredOn: "2026-03-01" }],
        expenses: [
          { amountCents: 25_000, occurredOn: "2026-03-01" },
          { amountCents: 55_000, occurredOn: "2026-03-20" },
        ],
      },
      { start: "2026-03-01", end: "2026-03-31" },
    );
    expect(result.incomeCents).toBe(40_000);
    expect(result.expenseCents).toBe(80_000);
    expect(result.surplusCents).toBe(-40_000);
    expect(result.savingsRate).toBe(-1);
  });

  it("returns a null savings rate when income in the range is zero", () => {
    const withExpenses = sumCashflow(
      {
        incomes: [{ amountCents: 10_000, occurredOn: "2026-04-01" }],
        expenses: [{ amountCents: 3_000, occurredOn: "2026-01-10" }],
      },
      range,
    );
    expect(withExpenses.incomeCents).toBe(0);
    expect(withExpenses.expenseCents).toBe(3_000);
    expect(withExpenses.surplusCents).toBe(-3_000);
    expect(withExpenses.savingsRate).toBeNull();

    const empty = sumCashflow({ incomes: [], expenses: [] }, range);
    expect(empty).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      surplusCents: 0,
      savingsRate: null,
    });
  });

  it("includes a single-day range and ignores a reversed range", () => {
    const day = sumCashflow(
      { incomes, expenses },
      { start: "2026-01-15", end: "2026-01-15" },
    );
    expect(day.incomeCents).toBe(100_000);
    expect(day.expenseCents).toBe(10_000);
    expect(day.surplusCents).toBe(90_000);

    const reversed = sumCashflow({ incomes, expenses }, {
      start: "2026-01-31",
      end: "2026-01-01",
    });
    expect(reversed.incomeCents).toBe(0);
    expect(reversed.expenseCents).toBe(0);
    expect(reversed.surplusCents).toBe(0);
    expect(reversed.savingsRate).toBeNull();
  });
});
