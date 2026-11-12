import { parseMoneyToCents } from "@/lib/money";
import type { WhatIfAdjustments, WhatIfChange } from "@/domain/scenario";

export type WhatIfMode = "amt" | "pct";

/** Raw text of each field, echoed back into the form so nothing typed is lost. */
export type WhatIfFormValues = {
  income: string;
  incomeMode: WhatIfMode;
  spend: string;
  spendMode: WhatIfMode;
  oneoff: string;
  debt: string;
  extra: string;
  rate: string;
};

export type WhatIfField = "income" | "spend" | "oneoff" | "debt" | "extra" | "rate";

export type WhatIfParseContext = {
  /** False when the trailing income/expense averages are unknown. */
  percentAvailable: boolean;
  /** `annualRateBps` is the recorded rate, used when no rate is typed. */
  liabilities: ReadonlyArray<{ id: number; balanceCents: number; annualRateBps?: number | null }>;
};

export type WhatIfParseResult = {
  values: WhatIfFormValues;
  errors: Partial<Record<WhatIfField, string>>;
  /** Null when any field is invalid. */
  adjustments: WhatIfAdjustments | null;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_PERCENT_BPS = 100_000; // ±1000%
const MAX_RATE_BPS = 10_000; // 100%

function text(raw: RawSearchParams, key: string): string {
  const value = raw[key];
  return (Array.isArray(value) ? (value[0] ?? "") : (value ?? "")).trim();
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Money with an optional leading sign. */
function parseSignedCents(input: string): Parsed<number> {
  const negative = input.startsWith("-");
  const unsigned = /^[+-]/.test(input) ? input.slice(1) : input;
  const parsed = parseMoneyToCents(unsigned);
  if (!parsed.ok) {
    return { ok: false, error: "Enter an amount with up to 2 decimal places, like 200 or -150.50." };
  }
  return { ok: true, value: negative ? -parsed.cents : parsed.cents };
}

/** Percent text with up to 2 decimals to integer basis points, without float math. */
function parsePercentToBps(input: string, allowSign: boolean): Parsed<number> {
  const pattern = allowSign ? /^([+-]?)(\d{1,6})(?:\.(\d{1,2}))?$/ : /^()(\d{1,6})(?:\.(\d{1,2}))?$/;
  const match = pattern.exec(input);
  if (!match) {
    return {
      ok: false,
      error: allowSign
        ? "Enter a percent with up to 2 decimal places, like 10 or -7.5."
        : "Enter a percent of zero or more with up to 2 decimal places, like 3.5.",
    };
  }
  const bps = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return { ok: true, value: match[1] === "-" ? -bps : bps };
}

function parseChange(
  input: string,
  mode: WhatIfMode,
  percentAvailable: boolean,
): Parsed<WhatIfChange | null> {
  if (input === "") return { ok: true, value: null };

  if (mode === "pct") {
    if (!percentAvailable) {
      return {
        ok: false,
        error: "Percent needs three full months of journal entries. Enter an amount instead.",
      };
    }
    const parsed = parsePercentToBps(input, true);
    if (!parsed.ok) return parsed;
    if (Math.abs(parsed.value) > MAX_PERCENT_BPS) {
      return { ok: false, error: "Enter a percent between -1000 and 1000." };
    }
    return {
      ok: true,
      value: parsed.value === 0 ? null : { kind: "percent", bps: parsed.value },
    };
  }

  const parsed = parseSignedCents(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: parsed.value === 0 ? null : { kind: "amount", cents: parsed.value },
  };
}

export function parseWhatIfParams(
  raw: RawSearchParams,
  context: WhatIfParseContext,
): WhatIfParseResult {
  const values: WhatIfFormValues = {
    income: text(raw, "income"),
    incomeMode: text(raw, "incomeMode") === "pct" ? "pct" : "amt",
    spend: text(raw, "spend"),
    spendMode: text(raw, "spendMode") === "pct" ? "pct" : "amt",
    oneoff: text(raw, "oneoff"),
    debt: text(raw, "debt"),
    extra: text(raw, "extra"),
    rate: text(raw, "rate"),
  };
  const errors: Partial<Record<WhatIfField, string>> = {};

  const income = parseChange(values.income, values.incomeMode, context.percentAvailable);
  if (!income.ok) errors.income = income.error;

  const spending = parseChange(values.spend, values.spendMode, context.percentAvailable);
  if (!spending.ok) errors.spend = spending.error;
  if (
    spending.ok &&
    spending.value?.kind === "percent" &&
    spending.value.bps < -10_000
  ) {
    errors.spend = "Spending cannot be cut by more than 100%.";
  }

  let oneOffCents = 0;
  if (values.oneoff !== "") {
    const parsed = parseSignedCents(values.oneoff);
    if (parsed.ok) oneOffCents = parsed.value;
    else errors.oneoff = parsed.error;
  }

  let debt: WhatIfAdjustments["debt"] = null;
  if (values.extra !== "" || values.rate !== "") {
    const liability = context.liabilities.find((l) => String(l.id) === values.debt);
    if (!liability) {
      errors.debt = "Choose the liability to overpay.";
    } else if (liability.balanceCents <= 0) {
      errors.debt = "This liability has no balance to pay down.";
    }

    let extraCents: number | null = null;
    if (values.extra === "") {
      errors.extra = "Enter the extra monthly payment.";
    } else {
      const parsed = parseMoneyToCents(values.extra);
      if (!parsed.ok) errors.extra = parsed.error;
      else if (parsed.cents === 0) errors.extra = "Enter an extra payment above zero.";
      else extraCents = parsed.cents;
    }

    let rateBps: number | null = null;
    const storedRateBps = liability?.annualRateBps ?? null;
    if (values.rate === "" && storedRateBps !== null) {
      rateBps = storedRateBps;
    } else if (values.rate === "") {
      errors.rate = "Enter the annual interest rate.";
    } else {
      const parsed = parsePercentToBps(values.rate, false);
      if (!parsed.ok) errors.rate = parsed.error;
      else if (parsed.value > MAX_RATE_BPS) errors.rate = "Enter a rate of 100 or less.";
      else rateBps = parsed.value;
    }

    if (liability && liability.balanceCents > 0 && extraCents !== null && rateBps !== null) {
      debt = {
        balanceCents: liability.balanceCents,
        extraMonthlyCents: extraCents,
        annualRateBps: rateBps,
      };
    }
  }

  const valid = Object.keys(errors).length === 0;
  return {
    values,
    errors,
    adjustments:
      valid && income.ok && spending.ok
        ? { income: income.value, spending: spending.value, oneOffCents, debt }
        : null,
  };
}
