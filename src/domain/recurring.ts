import { addMonths, isoDateToDayNumber, parseIsoDate } from "@/lib/dates";

export const CADENCES = ["monthly", "yearly", "weekly"] as const;
export type Cadence = (typeof CADENCES)[number];

export const MAX_CATCH_UP = 24;

export type RecurringSchedule = {
  cadence: Cadence;
  anchorOn: string;
  endOn: string | null;
  active: boolean;
};

export type DueOccurrence = { period: string; occurredOn: string };

export type RecurringLink = { templateId: number; period: string };

export function isCadence(value: string): value is Cadence {
  return (CADENCES as readonly string[]).includes(value);
}

function dayNumberToIso(dayNumber: number): string {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

/** Occurrence n (0-based), always computed from the anchor so month-end clamping never drifts. */
export function occurrenceDate(anchorOn: string, cadence: Cadence, n: number): string {
  if (cadence === "monthly") return addMonths(anchorOn, n);
  if (cadence === "yearly") return addMonths(anchorOn, 12 * n);
  return dayNumberToIso(isoDateToDayNumber(anchorOn)! + 7 * n);
}

function isoWeek(isoDate: string): { year: number; week: number } {
  const { year, month, day } = parseIsoDate(isoDate);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = Date.UTC(weekYear, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return { year: weekYear, week };
}

/** Stable period key: one posting per key, independent of the exact day. */
export function periodKey(occurredOn: string, cadence: Cadence): string {
  if (cadence === "monthly") return occurredOn.slice(0, 7);
  if (cadence === "yearly") return occurredOn.slice(0, 4);
  const { year, week } = isoWeek(occurredOn);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Occurrences on or before `asOfDate` (and `endOn`) not yet posted, oldest first.
 * Only the most recent MAX_CATCH_UP occurrences are considered, posted or not,
 * so a long-dormant template never floods the review list.
 */
export function duePeriods(
  schedule: RecurringSchedule,
  postedPeriods: ReadonlySet<string>,
  asOfDate: string,
): DueOccurrence[] {
  if (!schedule.active) return [];
  const limit =
    schedule.endOn !== null && schedule.endOn < asOfDate ? schedule.endOn : asOfDate;

  const occurrences: DueOccurrence[] = [];
  for (let n = 0; ; n += 1) {
    const occurredOn = occurrenceDate(schedule.anchorOn, schedule.cadence, n);
    if (occurredOn > limit) break;
    occurrences.push({ occurredOn, period: periodKey(occurredOn, schedule.cadence) });
  }

  return occurrences
    .slice(-MAX_CATCH_UP)
    .filter((occurrence) => !postedPeriods.has(occurrence.period));
}

/** The first occurrence after `asOfDate`, or null when the schedule has ended. */
export function nextOccurrence(schedule: RecurringSchedule, asOfDate: string): string | null {
  for (let n = 0; ; n += 1) {
    const occurredOn = occurrenceDate(schedule.anchorOn, schedule.cadence, n);
    if (schedule.endOn !== null && occurredOn > schedule.endOn) return null;
    if (occurredOn > asOfDate) return occurredOn;
  }
}
