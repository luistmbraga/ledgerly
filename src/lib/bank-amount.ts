import { isValidIsoDate } from "./dates";

export type BankAmountResult = { ok: true; cents: number } | { ok: false };

export type DecimalSeparator = "," | ".";

/**
 * Parses an amount as printed on a bank statement into signed integer cents.
 * Accepts thousands separators, a leading sign, parentheses for negatives and a
 * trailing currency marker. Anything else is rejected rather than guessed.
 */
export function parseBankAmount(
  raw: string,
  options: { decimal: DecimalSeparator },
): BankAmountResult {
  let text = raw.trim().replace(/\s*(EUR|€)$/i, "").trim();

  let negative = false;
  const parenthesised = /^\((.*)\)$/.exec(text);
  if (parenthesised) {
    negative = true;
    text = parenthesised[1].trim();
  }
  if (text.startsWith("-") || text.startsWith("+")) {
    if (parenthesised) return { ok: false };
    negative = text.startsWith("-");
    text = text.slice(1).trim();
  }

  const thousands = options.decimal === "," ? "[.\\s\\u00a0]" : "[,\\s\\u00a0]";
  const decimal = options.decimal === "," ? "," : "\\.";
  const pattern = new RegExp(
    `^(\\d{1,3}(?:${thousands}\\d{3})+|\\d+)(?:${decimal}(\\d{1,2}))?$`,
  );
  const match = pattern.exec(text);
  if (!match) return { ok: false };

  const whole = Number(match[1].replace(/\D/g, ""));
  const fraction = Number((match[2] ?? "0").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  if (!Number.isSafeInteger(cents)) return { ok: false };
  return { ok: true, cents: negative && cents !== 0 ? -cents : cents };
}

export type BankDateFormat = "DD-MM-YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

/** Converts a statement date to ISO `YYYY-MM-DD`, or null when it is not a real date. */
export function parseBankDate(raw: string, format: BankDateFormat): string | null {
  const text = raw.trim();
  let iso: string | null = null;
  if (format === "YYYY-MM-DD") {
    iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  } else {
    const separator = format === "DD-MM-YYYY" ? "-" : "/";
    const match = new RegExp(`^(\\d{2})${separator}(\\d{2})${separator}(\\d{4})$`).exec(text);
    iso = match ? `${match[3]}-${match[2]}-${match[1]}` : null;
  }
  return iso !== null && isValidIsoDate(iso) ? iso : null;
}
