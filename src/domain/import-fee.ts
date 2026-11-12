import { parseMoneyToCents } from "@/lib/money";

/**
 * A broker trade row (e.g. "Buy trade …" for 1 501,07) moves money into a holding, but
 * part of it can be a fee. Splitting imports only the fee, as an expense.
 */

export type FeeResult = { ok: true; cents: number } | { ok: false; error: string };

/** Checks a fee in cents against the trade it is split from. */
export function checkTradeFee(feeCents: number, tradeAmountCents: number): FeeResult {
  if (!Number.isSafeInteger(feeCents) || feeCents <= 0) return { ok: false, error: "Enter a fee above zero." };
  if (feeCents >= tradeAmountCents) {
    return { ok: false, error: "The fee must be less than the trade amount." };
  }
  return { ok: true, cents: feeCents };
}

/** Parses a typed fee ("1.07" or "1,07") and checks it against the trade amount. */
export function parseTradeFee(input: string, tradeAmountCents: number): FeeResult {
  const parsed = parseMoneyToCents(input.trim().replace(",", "."));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return checkTradeFee(parsed.cents, tradeAmountCents);
}

/** Default note for the imported fee row. */
export function feeNote(description: string): string {
  return `Fee: ${description}`.slice(0, 500);
}

/**
 * What a selected statement row imports as. Without a fee it is the row itself; with
 * one, the row must be flagged as an investment trade and only the fee is imported.
 */
export function resolveImportedAmount(input: {
  kind: "expense" | "income";
  amountCents: number;
  flagType: string | null;
  feeCents: number | undefined;
}): { ok: true; kind: "expense" | "income"; amountCents: number } | { ok: false; error: string } {
  if (input.feeCents === undefined) return { ok: true, kind: input.kind, amountCents: input.amountCents };
  if (input.flagType !== "investment_trade") {
    return { ok: false, error: "Only investment trade rows can have a fee split off." };
  }
  const fee = checkTradeFee(input.feeCents, input.amountCents);
  if (!fee.ok) return fee;
  return { ok: true, kind: "expense", amountCents: fee.cents };
}
