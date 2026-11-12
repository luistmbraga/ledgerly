/**
 * Shared reading of statement lines shaped "<description> <amount> <balance>" where the
 * PDF text lost the debit/credit column, so the sign comes from the running balance.
 */

export type AmountFormat = {
  /** Regex source for an unsigned amount, e.g. `\d{1,3}(?: \d{3})*\.\d{2}`. */
  amount: string;
  /** Parses a matched amount (possibly with a leading minus) into cents. */
  parse: (raw: string) => number | null;
  /** A token printed after each amount, e.g. "€". */
  marker?: string;
};

type Split = { description: string; amountCents: number; balanceCents: number };

export type ChainedLine =
  | { ok: true; description: string; amountCents: number; balanceCents: number }
  | { ok: false; balanceCents: number | null };

/**
 * Every way to read the line when thousands are separated by spaces:
 * "LOJA 12 345.00 1 000.00" could be amount 345.00 or 12 345.00.
 * Ordered so the reading that keeps the most text in the description comes first.
 */
function splits(tail: string, format: AmountFormat): Split[] {
  const isAmount = new RegExp(`^${format.amount}$`);
  const isBalance = new RegExp(`^-?${format.amount}$`);
  let tokens = tail.split(" ");
  const marker = format.marker;
  const found: Split[] = [];

  if (marker !== undefined) {
    if (tokens[tokens.length - 1] !== marker) return found;
    tokens = tokens.slice(0, -1);
  }

  for (let b = tokens.length - 1; b >= 2; b -= 1) {
    const balanceText = tokens.slice(b).join(" ");
    if (!isBalance.test(balanceText)) continue;
    let amountEnd = b;
    if (marker !== undefined) {
      if (tokens[b - 1] !== marker) continue;
      amountEnd = b - 1;
    }
    for (let a = amountEnd - 1; a >= 1; a -= 1) {
      const amountText = tokens.slice(a, amountEnd).join(" ");
      if (!isAmount.test(amountText)) continue;
      const amountCents = format.parse(amountText);
      const balanceCents = format.parse(balanceText);
      if (amountCents === null || balanceCents === null) continue;
      found.push({ description: tokens.slice(0, a).join(" "), amountCents, balanceCents });
    }
  }
  return found;
}

/**
 * Picks the split whose amount, added to or taken from `previous`, gives the printed
 * balance, and signs the amount accordingly. When nothing chains, returns the most
 * likely balance so the caller can keep following the chain.
 */
export function readChainedLine(tail: string, previous: number | null, format: AmountFormat): ChainedLine {
  const options = splits(tail, format);
  const pick =
    previous === null
      ? undefined
      : options.find(
          (s) => previous + s.amountCents === s.balanceCents || previous - s.amountCents === s.balanceCents,
        );
  if (!pick || previous === null) return { ok: false, balanceCents: options[0]?.balanceCents ?? null };
  const signed = previous + pick.amountCents === pick.balanceCents ? pick.amountCents : -pick.amountCents;
  return { ok: true, description: pick.description, amountCents: signed, balanceCents: pick.balanceCents };
}
