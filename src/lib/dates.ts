/** Parses an ISO-8601 date string. Throws on invalid input. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
  return { year, month, day };
}

/** Parses an ISO-8601 date string. Returns null on invalid input. */
export function parseIsoDateOrNull(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Returns true if the string is a valid ISO-8601 calendar date. */
export function isValidIsoDate(value: string): boolean {
  return parseIsoDateOrNull(value) !== null;
}

/** Returns today's date in UTC as YYYY-MM-DD. */
export function todayUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns the number of days in the given month (1-indexed). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Adds `delta` months to an ISO date string.
 * The day is clamped to the last day of the target month.
 */
export function addMonths(isoDate: string, delta: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const totalMonths = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = totalMonths - newYear * 12 + 1;
  const newDay = Math.min(day, lastDayOfMonth(newYear, newMonth));
  return `${newYear}-${String(newMonth).padStart(2, "0")}-${String(newDay).padStart(2, "0")}`;
}

/**
 * Returns the number of full calendar months from `from` to `to`.
 * A partial final month does not count.
 */
export function fullMonthsBetween(from: string, to: string): number {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  let months = (end.year - start.year) * 12 + (end.month - start.month);
  if (end.day < start.day) months -= 1;
  return months;
}

/**
 * Converts an ISO date string to days since Unix epoch (1970-01-01 = 0).
 * Returns null if the input is invalid.
 */
export function isoDateToDayNumber(isoDate: string): number | null {
  const parsed = parseIsoDateOrNull(isoDate);
  if (parsed === null) return null;
  return Math.floor(
    new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getTime() / 86_400_000,
  );
}
