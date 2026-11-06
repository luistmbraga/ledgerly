import type { AssetType } from "@/domain/net-worth";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  cash: "Cash",
  brokerage: "Brokerage",
  crypto: "Crypto",
  real_estate: "Real estate",
  vehicle: "Vehicle",
  retirement: "Retirement",
  business: "Business",
  receivable: "Receivable",
  other: "Other",
};

export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
