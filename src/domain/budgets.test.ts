import { describe, expect, it } from "vitest";
import { computeBudgetStatus } from "./budgets";

describe("computeBudgetStatus", () => {
  it("returns ok when nothing spent", () => {
    const s = computeBudgetStatus(1, "Food", 30000, 0);
    expect(s.status).toBe("ok");
    expect(s.consumptionRatio).toBe(0);
    expect(s.remainingCents).toBe(30000);
  });

  it("returns ok at 70% consumption", () => {
    const s = computeBudgetStatus(1, "Food", 10000, 7000);
    expect(s.status).toBe("ok");
  });

  it("returns warning at exactly 80%", () => {
    const s = computeBudgetStatus(1, "Food", 10000, 8000);
    expect(s.status).toBe("warning");
    expect(s.consumptionRatio).toBeCloseTo(0.8);
  });

  it("returns warning just above 80%", () => {
    const s = computeBudgetStatus(1, "Food", 10000, 8001);
    expect(s.status).toBe("warning");
  });

  it("returns over at exactly 100%", () => {
    const s = computeBudgetStatus(1, "Food", 10000, 10000);
    expect(s.status).toBe("over");
    expect(s.remainingCents).toBe(0);
  });

  it("returns over and negative remainingCents at 110%", () => {
    const s = computeBudgetStatus(1, "Food", 10000, 11000);
    expect(s.status).toBe("over");
    expect(s.remainingCents).toBe(-1000);
    expect(s.consumptionRatio).toBeCloseTo(1.1);
  });

  it("throws for budgetCents of zero", () => {
    expect(() => computeBudgetStatus(1, "Food", 0, 0)).toThrow();
  });

  it("throws for negative budgetCents", () => {
    expect(() => computeBudgetStatus(1, "Food", -100, 0)).toThrow();
  });

  it("carries categoryId and categoryName through", () => {
    const s = computeBudgetStatus(42, "Groceries", 20000, 5000);
    expect(s.categoryId).toBe(42);
    expect(s.categoryName).toBe("Groceries");
    expect(s.budgetCents).toBe(20000);
    expect(s.spentCents).toBe(5000);
  });
});
