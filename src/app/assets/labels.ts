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

export const ASSET_TYPE_DESCRIPTIONS: Record<AssetType, string> = {
  cash: "Bank balances and cash you hold.",
  brokerage: "A taxable investment account, such as stocks or funds.",
  crypto: "Cryptocurrency you hold.",
  real_estate: "Property you own.",
  vehicle: "A car or other vehicle.",
  retirement: "A retirement or pension account.",
  business: "A business or ownership stake, valued by you.",
  receivable: "Money someone owes you. Enter the balance yourself.",
  other: "Anything that does not fit the other types.",
};

export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
