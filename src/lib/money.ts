export type MoneyParseResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    const negative = cents < 0;
    const absolute = Math.abs(Math.trunc(cents));
    const whole = Math.trunc(absolute / 100);
    const fraction = String(absolute % 100).padStart(2, "0");
    return `${negative ? "-" : ""}${whole}.${fraction} ${currency}`;
  }
}

export function centsToDecimalInput(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function parseMoneyToCents(input: string): MoneyParseResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: false, error: "Enter an amount." };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      ok: false,
      error: "Enter a non-negative amount with up to 2 decimal places.",
    };
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, error: "Amount is too large." };
  }
  return { ok: true, cents };
}
