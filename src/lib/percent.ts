/**
 * Format a 0–1 ratio as a one-decimal percent string.
 * Caps the per-mille rounding at 999 so a ratio just below 1 never displays as "100%".
 * Returns null for null or non-finite input.
 */
export function formatRatio(ratio: number | null): string | null {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  if (ratio >= 1) return "100%";
  if (ratio <= 0) return "0%";
  const ppt = Math.min(Math.round(ratio * 1000), 999);
  const tenth = ppt / 10;
  const text = Number.isInteger(tenth) ? String(tenth) : tenth.toFixed(1);
  return `${text}%`;
}

/**
 * Convert a 0–1 ratio to an integer 0–100 for visual elements (arc lengths, bar widths).
 * Not for text display — use formatRatio for that.
 */
export function ratioToVisualPercent(ratio: number): number {
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}

/**
 * Format integer basis points (10000 = 100%) as a percent string.
 * Uses integer arithmetic to avoid float artifacts.
 */
export function formatBps(bps: number | null): string | null {
  if (bps === null || !Number.isFinite(bps)) return null;
  const whole = Math.trunc(bps / 100);
  const rem = Math.abs(bps % 100);
  const text = rem === 0 ? String(whole) : `${whole}.${String(rem).padStart(2, "0").replace(/0+$/, "")}`;
  return `${text}%`;
}

/** Largest annual interest rate an account may carry: 100%. */
export const MAX_ANNUAL_RATE_BPS = 10_000;

export function isValidAnnualRateBps(bps: number | null): boolean {
  return bps === null || (Number.isSafeInteger(bps) && bps >= 0 && bps <= MAX_ANNUAL_RATE_BPS);
}

/**
 * Parse an optional annual rate typed as a percent ("3.5") into basis points.
 * Blank means "not recorded" and returns null. No float math.
 */
export function parseAnnualRatePercent(
  input: string,
): { ok: true; bps: number | null } | { ok: false; error: string } {
  const text = input.trim();
  if (text === "") return { ok: true, bps: null };
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    return { ok: false, error: "Enter a rate from 0 to 100 with up to 2 decimal places, like 3.5." };
  }
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (bps > MAX_ANNUAL_RATE_BPS) return { ok: false, error: "Enter a rate of 100 or less." };
  return { ok: true, bps };
}

/** Basis points back to the percent text a rate input shows ("350" → "3.5"). Null → "". */
export function bpsToPercentInput(bps: number | null): string {
  if (bps === null) return "";
  return (formatBps(bps) ?? "").replace(/%$/, "");
}
