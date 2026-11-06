const TICKER_ALLOWLIST = new Set(["EUR", "USD", "GBP", "CHF"]);

function numberKey(token: string): string {
  const value = Number(token);
  if (!Number.isFinite(value)) return token;
  return Object.is(value, -0) ? "0" : String(value);
}

function collectNumbers(value: unknown, into: Set<string>) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return;
  for (const match of text.matchAll(/-?\d+(?:\.\d+)?/g)) {
    into.add(numberKey(match[0]));
  }
}

/** Numbers in `output` that do not already appear in `input`. */
export function numbersMissingFromInput(
  input: unknown,
  output: unknown,
): string[] {
  const allowed = new Set<string>();
  collectNumbers(input, allowed);
  const found = new Set<string>();
  collectNumbers(output, found);
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
