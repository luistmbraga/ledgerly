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
