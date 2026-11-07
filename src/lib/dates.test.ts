import { describe, expect, it } from "vitest";
import {
  addMonths,
  fullMonthsBetween,
  isValidIsoDate,
  isoDateToDayNumber,
  lastDayOfMonth,
  parseIsoDate,
  parseIsoDateOrNull,
  todayUtc,
} from "./dates";

describe("parseIsoDate", () => {
  it("parses a normal date", () => {
    expect(parseIsoDate("2026-03-15")).toEqual({ year: 2026, month: 3, day: 15 });
  });

  it("parses a leap-year Feb 29", () => {
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("parses Jan 31", () => {
    expect(parseIsoDate("2026-01-31")).toEqual({ year: 2026, month: 1, day: 31 });
  });

  it("throws on non-leap Feb 29", () => {
    expect(() => parseIsoDate("2026-02-29")).toThrow("Invalid date");
  });

  it("throws on month 13", () => {
    expect(() => parseIsoDate("2026-13-01")).toThrow("Invalid date");
  });

  it("throws on day 0", () => {
    expect(() => parseIsoDate("2026-03-00")).toThrow("Invalid date");
  });

  it("throws on a plain string", () => {
    expect(() => parseIsoDate("not-a-date")).toThrow("Invalid date");
  });

  it("throws on empty string", () => {
    expect(() => parseIsoDate("")).toThrow("Invalid date");
  });
});

describe("parseIsoDateOrNull", () => {
  it("returns parsed object for a valid date", () => {
    expect(parseIsoDateOrNull("2026-06-30")).toEqual({ year: 2026, month: 6, day: 30 });
  });

  it("returns null for an invalid date", () => {
    expect(parseIsoDateOrNull("2026-02-30")).toBeNull();
  });

  it("returns null for a non-date string", () => {
    expect(parseIsoDateOrNull("hello")).toBeNull();
  });
});

describe("isValidIsoDate", () => {
  it("returns true for valid dates", () => {
    expect(isValidIsoDate("2026-01-01")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2000-12-31")).toBe(true);
  });

  it("returns false for invalid dates", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-00-01")).toBe(false);
    expect(isValidIsoDate("2026-01-32")).toBe(false);
    expect(isValidIsoDate("not-a-date")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("todayUtc", () => {
  it("returns a string matching YYYY-MM-DD", () => {
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a valid ISO date", () => {
    expect(isValidIsoDate(todayUtc())).toBe(true);
  });
});

describe("lastDayOfMonth", () => {
  it("returns 31 for January", () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31);
  });

  it("returns 28 for Feb in a non-leap year", () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
  });

  it("returns 29 for Feb in a leap year", () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29);
  });

  it("returns 30 for April", () => {
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });

  it("returns 31 for December", () => {
    expect(lastDayOfMonth(2026, 12)).toBe(31);
  });
});

describe("addMonths", () => {
  it("adds months within the same year", () => {
    expect(addMonths("2026-01-15", 2)).toBe("2026-03-15");
  });

  it("wraps across year boundary", () => {
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
  });

  it("clamps day to last day of shorter target month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("clamps Jan 31 to Feb 29 in a leap year", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("subtracts months with negative delta", () => {
    expect(addMonths("2026-03-15", -2)).toBe("2026-01-15");
  });

  it("handles delta of 0", () => {
    expect(addMonths("2026-06-15", 0)).toBe("2026-06-15");
  });
});

describe("fullMonthsBetween", () => {
  it("counts one full month", () => {
    expect(fullMonthsBetween("2026-01-15", "2026-02-15")).toBe(1);
  });

  it("returns 0 for dates in the same month", () => {
    expect(fullMonthsBetween("2026-01-01", "2026-01-31")).toBe(0);
  });

  it("does not count a partial final month", () => {
    expect(fullMonthsBetween("2026-01-15", "2026-02-14")).toBe(0);
  });

  it("month-end rule: Jan 31 to Feb 28 is 1 (Feb 28 is last day of Feb)", () => {
    expect(fullMonthsBetween("2026-01-31", "2026-02-28")).toBe(1);
  });

  it("month-end rule: Mar 31 to Apr 30 is 1 (Apr 30 is last day of Apr)", () => {
    expect(fullMonthsBetween("2026-03-31", "2026-04-30")).toBe(1);
  });

  it("month-end rule: Jan 31 to Feb 28 in a leap year (Feb 29 is last day)", () => {
    expect(fullMonthsBetween("2024-01-31", "2024-02-29")).toBe(1);
  });

  it("non-month-end: Jan 31 to Feb 27 is still 0", () => {
    expect(fullMonthsBetween("2026-01-31", "2026-02-27")).toBe(0);
  });

  it("existing test: Jan 31 to Jul 30 is 5", () => {
    expect(fullMonthsBetween("2026-01-31", "2026-07-30")).toBe(5);
  });

  it("counts across a year boundary", () => {
    expect(fullMonthsBetween("2025-11-10", "2026-02-10")).toBe(3);
  });

  it("throws when given an invalid date", () => {
    expect(() => fullMonthsBetween("bad", "2026-02-28")).toThrow("Invalid date");
  });
});

describe("isoDateToDayNumber", () => {
  it("returns 0 for the Unix epoch", () => {
    expect(isoDateToDayNumber("1970-01-01")).toBe(0);
  });

  it("returns 1 for 1970-01-02", () => {
    expect(isoDateToDayNumber("1970-01-02")).toBe(1);
  });

  it("returns null for an invalid date", () => {
    expect(isoDateToDayNumber("not-a-date")).toBeNull();
    expect(isoDateToDayNumber("2026-02-30")).toBeNull();
  });

  it("later dates have higher day numbers", () => {
    const a = isoDateToDayNumber("2026-01-01")!;
    const b = isoDateToDayNumber("2026-02-01")!;
    expect(b).toBe(a + 31);
  });
});
