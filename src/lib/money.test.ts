import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyToCents } from "./money";

describe("parseMoneyToCents", () => {
  it("rejects empty string", () => {
    const r = parseMoneyToCents("");
    expect(r.ok).toBe(false);
  });
  it("rejects negative value '-1'", () => {
    const r = parseMoneyToCents("-1");
    expect(r.ok).toBe(false);
  });
  it("rejects trailing dot '1.'", () => {
    const r = parseMoneyToCents("1.");
    expect(r.ok).toBe(false);
  });
  it("rejects three decimal places '1.234'", () => {
    const r = parseMoneyToCents("1.234");
    expect(r.ok).toBe(false);
  });
  it("rejects comma-separated '1,000'", () => {
    const r = parseMoneyToCents("1,000");
    expect(r.ok).toBe(false);
  });
  it("parses '0' as 0 cents", () => {
    expect(parseMoneyToCents("0")).toEqual({ ok: true, cents: 0 });
  });
  it("parses '1' as 100 cents", () => {
    expect(parseMoneyToCents("1")).toEqual({ ok: true, cents: 100 });
  });
  it("parses '1.50' as 150 cents", () => {
    expect(parseMoneyToCents("1.50")).toEqual({ ok: true, cents: 150 });
  });
  it("parses '1.5' as 150 cents", () => {
    expect(parseMoneyToCents("1.5")).toEqual({ ok: true, cents: 150 });
  });
  it("parses '100.00' as 10000 cents", () => {
    expect(parseMoneyToCents("100.00")).toEqual({ ok: true, cents: 10000 });
  });
  it("rejects overflow", () => {
    const r = parseMoneyToCents("999999999999999");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/i);
  });
});

describe("formatMoney", () => {
  it("formats whole cents", () => {
    expect(formatMoney(100, "EUR")).toContain("1.00");
  });
  it("formats zero", () => {
    expect(formatMoney(0, "EUR")).toContain("0.00");
  });
  it("formats negative cents (shows minus sign)", () => {
    const result = formatMoney(-100, "EUR");
    expect(result).toContain("1.00");
    expect(result).toContain("-");
  });
  it("catch branch: invalid currency uses integer arithmetic", () => {
    expect(formatMoney(12345, "INVALID")).toBe("123.45 INVALID");
  });
  it("catch branch: zero cents", () => {
    expect(formatMoney(0, "INVALID")).toBe("0.00 INVALID");
  });
  it("catch branch: single cent", () => {
    expect(formatMoney(1, "INVALID")).toBe("0.01 INVALID");
  });
  it("catch branch: negative single cent", () => {
    expect(formatMoney(-1, "INVALID")).toBe("-0.01 INVALID");
  });
  it("catch branch: negative amount", () => {
    expect(formatMoney(-12345, "INVALID")).toBe("-123.45 INVALID");
  });
});
