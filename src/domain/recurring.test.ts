import { describe, expect, it } from "vitest";
import {
  MAX_CATCH_UP,
  duePeriods,
  nextOccurrence,
  occurrenceDate,
  periodKey,
  type RecurringSchedule,
} from "./recurring";

function monthly(anchorOn: string, extra: Partial<RecurringSchedule> = {}): RecurringSchedule {
  return { cadence: "monthly", anchorOn, endOn: null, active: true, ...extra };
}

const none = new Set<string>();

describe("occurrenceDate", () => {
  it("clamps month-end anchors without drifting", () => {
    expect(occurrenceDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceDate("2026-01-31", "monthly", 3)).toBe("2026-04-30");
  });

  it("clamps Feb 29 yearly anchors in non-leap years", () => {
    expect(occurrenceDate("2028-02-29", "yearly", 1)).toBe("2029-02-28");
    expect(occurrenceDate("2028-02-29", "yearly", 4)).toBe("2032-02-29");
  });

  it("steps weekly by 7 days across month and year boundaries", () => {
    expect(occurrenceDate("2026-12-28", "weekly", 1)).toBe("2027-01-04");
  });
});

describe("periodKey", () => {
  it("uses month, year and ISO week", () => {
    expect(periodKey("2026-11-12", "monthly")).toBe("2026-11");
    expect(periodKey("2026-11-12", "yearly")).toBe("2026");
    expect(periodKey("2026-11-12", "weekly")).toBe("2026-W46");
  });

  it("assigns ISO week-year at year boundaries", () => {
    expect(periodKey("2027-01-01", "weekly")).toBe("2026-W53");
    expect(periodKey("2025-12-29", "weekly")).toBe("2026-W01");
  });
});

describe("duePeriods", () => {
  it("lists month-end occurrences up to the as-of date", () => {
    expect(duePeriods(monthly("2026-01-31"), none, "2026-04-30")).toEqual([
      { period: "2026-01", occurredOn: "2026-01-31" },
      { period: "2026-02", occurredOn: "2026-02-28" },
      { period: "2026-03", occurredOn: "2026-03-31" },
      { period: "2026-04", occurredOn: "2026-04-30" },
    ]);
  });

  it("excludes occurrences after the as-of date", () => {
    expect(duePeriods(monthly("2026-01-31"), none, "2026-04-29")).toHaveLength(3);
  });

  it("skips posted periods", () => {
    const posted = new Set(["2026-01", "2026-03"]);
    expect(duePeriods(monthly("2026-01-15"), posted, "2026-03-20").map((d) => d.period)).toEqual([
      "2026-02",
    ]);
  });

  it("returns nothing for an inactive template", () => {
    expect(duePeriods(monthly("2026-01-01", { active: false }), none, "2026-06-01")).toEqual([]);
  });

  it("stops at the end date", () => {
    const due = duePeriods(monthly("2026-01-10", { endOn: "2026-03-10" }), none, "2026-12-31");
    expect(due.map((d) => d.period)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("returns nothing when the anchor is in the future", () => {
    expect(duePeriods(monthly("2027-01-01"), none, "2026-11-12")).toEqual([]);
  });

  it("caps catch-up to the most recent occurrences", () => {
    const due = duePeriods(monthly("2020-01-05"), none, "2026-11-12");
    expect(due).toHaveLength(MAX_CATCH_UP);
    expect(due.at(-1)).toEqual({ period: "2026-11", occurredOn: "2026-11-05" });
    expect(due[0].period).toBe("2024-12");
  });

  it("does not resurface occurrences older than the cap after recent ones are posted", () => {
    const recent = duePeriods(monthly("2020-01-05"), none, "2026-11-12");
    const posted = new Set(recent.map((d) => d.period));
    expect(duePeriods(monthly("2020-01-05"), posted, "2026-11-12")).toEqual([]);
  });

  it("lists yearly and weekly occurrences", () => {
    const yearly: RecurringSchedule = { cadence: "yearly", anchorOn: "2025-03-01", endOn: null, active: true };
    expect(duePeriods(yearly, none, "2026-11-12").map((d) => d.period)).toEqual(["2025", "2026"]);
    const weekly: RecurringSchedule = { cadence: "weekly", anchorOn: "2026-11-02", endOn: null, active: true };
    expect(duePeriods(weekly, none, "2026-11-12").map((d) => d.occurredOn)).toEqual([
      "2026-11-02",
      "2026-11-09",
    ]);
  });
});

describe("nextOccurrence", () => {
  it("returns the first occurrence after the as-of date", () => {
    expect(nextOccurrence(monthly("2026-01-31"), "2026-02-28")).toBe("2026-03-31");
  });

  it("returns null when the schedule has ended", () => {
    expect(nextOccurrence(monthly("2026-01-01", { endOn: "2026-03-01" }), "2026-03-01")).toBeNull();
  });
});
