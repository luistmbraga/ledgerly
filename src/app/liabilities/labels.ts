import type { LiabilityType } from "@/domain/net-worth";

export const LIABILITY_TYPE_LABELS: Record<LiabilityType, string> = {
  mortgage: "Mortgage",
  loan: "Loan",
  credit_card: "Credit card",
  other: "Other",
};
