const TICKER_ALLOWLIST = new Set(["EUR", "USD", "GBP", "CHF"]);

function numberKey(token: string): string {
  const value = Number(token);
  if (!Number.isFinite(value)) return token;
  return Object.is(value, -0) ? "0" : String(value);
}

/** Strip thousands-separator commas so €3,000.00 yields the same token as 3000. */
function normalizeForNumbers(text: string): string {
  return text.replace(/,/g, "");
}

function collectNumbersFromText(text: string, into: Set<string>) {
  if (!text) return;
  const normalized = normalizeForNumbers(text);
  for (const match of normalized.matchAll(/-?\d+(?:\.\d+)?/g)) {
    into.add(numberKey(match[0]));
  }
}

/** Walk a value and collect digit tokens from string leaves only (not numeric ids). */
function collectNumbersFromStrings(value: unknown, into: Set<string>) {
  if (typeof value === "string") {
    collectNumbersFromText(value, into);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbersFromStrings(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectNumbersFromStrings(item, into);
    }
  }
}

/**
 * Numbers in string fields of `output` that do not already appear in `quotable`.
 * Pass only display strings (and the expense note), not ids or dates.
 * Numeric JSON fields (e.g. categoryId) are ignored.
 */
export function numbersMissingFromInput(
  quotable: unknown,
  output: unknown,
): string[] {
  const allowed = new Set<string>();
  collectNumbersFromStrings(quotable, allowed);
  const found = new Set<string>();
  collectNumbersFromStrings(output, found);
  return [...found].filter((token) => !allowed.has(token));
}

function briefingText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as {
    headline?: unknown;
    disclaimer?: unknown;
    reason?: unknown;
    sections?: { heading?: unknown; body?: unknown }[];
  };
  const parts = [record.headline, record.disclaimer, record.reason];
  for (const section of record.sections ?? []) {
    parts.push(section.heading, section.body);
  }
  return parts.filter((part) => typeof part === "string").join("\n");
}

/** Rejects ticker-like symbols, return promises, and tax instructions. */
export function briefingProhibitedReason(value: unknown): string | null {
  const text = briefingText(value);
  if (/\bguaranteed\b/i.test(text)) return "guaranteed";
  if (/will return/i.test(text)) return "will return";
  if (/\btax(?:es|ation)?\b/i.test(text)) return "tax";
  if (/\bdeduct(?:ion|ible)?\b/i.test(text)) return "tax";
  const tickers = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  const blocked = tickers.find((token) => !TICKER_ALLOWLIST.has(token));
  if (blocked) return blocked;
  return null;
}
