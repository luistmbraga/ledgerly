export type BudgetStatus = {
  categoryId: number;
  categoryName: string;
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  consumptionRatio: number;
  status: "ok" | "warning" | "over";
};

const WARNING_THRESHOLD = 0.8;

export function computeBudgetStatus(
  categoryId: number,
  categoryName: string,
  budgetCents: number,
  spentCents: number,
): BudgetStatus {
  if (!Number.isSafeInteger(budgetCents) || budgetCents <= 0) {
    throw new Error("Budget must be a positive integer number of cents.");
  }
  const consumptionRatio = spentCents / budgetCents;
  const status: BudgetStatus["status"] =
    consumptionRatio >= 1 ? "over" : consumptionRatio >= WARNING_THRESHOLD ? "warning" : "ok";
  return {
    categoryId,
    categoryName,
    budgetCents,
    spentCents,
    remainingCents: budgetCents - spentCents,
    consumptionRatio,
    status,
  };
}
