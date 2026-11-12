import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cgdMovimentosParser } from "@/import/parsers/cgd";
import { toCandidates } from "./import-normalize";
import { detectRecurring, type DetectionRow } from "./recurring-detect";

const fixture = fs.readFileSync(
  path.join(__dirname, "../import/parsers/__fixtures__/cgd-movimentos.txt"),
  "utf-8",
);
const rows: DetectionRow[] = toCandidates(cgdMovimentosParser.parse(fixture).rows).map((c) => ({
  kind: c.kind,
  occurredOn: c.occurredOn!,
  amountCents: c.amountCents!,
  note: c.description,
  categoryId: null,
}));
const asOf = "2026-11-12";

describe("detectRecurring on the CGD fixture", () => {
  const suggestions = detectRecurring({ rows, templates: [], asOf });
  const summary = suggestions.map((s) => [s.kind, s.note, s.amountCents, s.amountVaries, s.anchorOn]);

  it("finds the monthly patterns and nothing else", () => {
    expect(summary).toEqual([
      ["expense", "COBRANCA PRESTACAO", 39_559, false, "2026-11-15"],
      ["expense", "C CLASSIC", 899, false, "2026-11-16"],
      ["expense", "GOLD ENERGY COMERCI", 3_573, true, "2026-11-16"],
      ["expense", "COBRANCA PRESTACAO", 33_130, false, "2026-11-20"],
      ["expense", "VODAFONE PORTUGAL COM", 4_164, false, "2026-11-20"],
      ["expense", "REALVSEGUROS", 800, false, "2026-11-21"],
      ["expense", "REALVSEGUROS", 974, false, "2026-11-21"],
      ["expense", "TRF Ana Maria Sousa C", 202_700, true, "2026-11-26"],
      ["income", "TRF OLX PORTUGAL SA", 308_511, true, "2026-11-26"],
      ["expense", "ENDESA ENERGIA", 4_292, true, "2026-11-27"],
      ["income", "TFI RITA GOMES ALVES", 42_500, false, "2026-12-01"],
      ["expense", "MUNICIPIO DE AMARES", 2_251, true, "2026-12-03"],
      ["expense", "MANUT CONTA PACOTE CA", 416, false, "2026-12-07"],
    ]);
  });

  it("keeps the two loan instalments apart with their own history", () => {
    const loans = suggestions.filter((s) => s.matchText === "cobranca prestacao");
    expect(loans.map((s) => s.occurrences.map((o) => o.amountCents))).toEqual([
      [39_559, 39_559, 39_559],
      [33_130, 33_130, 33_130],
    ]);
    expect(new Set(loans.map((s) => s.key)).size).toBe(2);
  });

  it("ignores irregular card spending and one-off purchases", () => {
    const texts = suggestions.map((s) => s.matchText);
    expect(texts.some((t) => t.includes("cp 117"))).toBe(false);
    expect(texts.some((t) => t.includes("amazon"))).toBe(false);
  });

  it("returns the same keys on a second run", () => {
    expect(detectRecurring({ rows, templates: [], asOf }).map((s) => s.key)).toEqual(
      suggestions.map((s) => s.key),
    );
  });
});

describe("detectRecurring filters", () => {
  it("skips patterns an existing template covers, by match text or by description", () => {
    const covered = detectRecurring({
      rows,
      templates: [
        { kind: "expense", matchText: "Endesa", note: "Electricity" },
        { kind: "expense", matchText: null, note: "Vodafone Portugal Com" },
        { kind: "income", matchText: "Endesa", note: null },
      ],
      asOf,
    }).map((s) => s.matchText);
    expect(covered).not.toContain("endesa energia");
    expect(covered).not.toContain("vodafone portugal com");
    expect(covered).toContain("gold energy comerci");
  });

  it("drops patterns whose last occurrence is more than 45 days old", () => {
    const later = detectRecurring({ rows, templates: [], asOf: "2026-12-20" }).map((s) => s.matchText);
    expect(later).toContain("manut conta pacote ca");
    expect(later).not.toContain("vodafone portugal com");
  });

  it("needs three occurrences 24–38 days apart", () => {
    const make = (dates: string[]): DetectionRow[] =>
      dates.map((occurredOn) => ({ kind: "expense", occurredOn, amountCents: 1_000, note: "GYM", categoryId: 3 }));
    const asOfLate = "2026-11-20";
    expect(detectRecurring({ rows: make(["2026-09-10", "2026-10-10"]), templates: [], asOf: asOfLate })).toEqual([]);
    expect(
      detectRecurring({ rows: make(["2026-08-10", "2026-09-10", "2026-11-10"]), templates: [], asOf: asOfLate }),
    ).toEqual([]);
    expect(
      detectRecurring({ rows: make(["2026-09-10", "2026-10-10", "2026-11-10"]), templates: [], asOf: asOfLate })[0],
    ).toMatchObject({ categoryId: 3, anchorOn: "2026-12-10" });
  });

  it("picks the most used category, preferring the latest on a tie", () => {
    const base = { kind: "expense" as const, amountCents: 1_000, note: "GYM" };
    const [suggestion] = detectRecurring({
      rows: [
        { ...base, occurredOn: "2026-08-10", categoryId: 1 },
        { ...base, occurredOn: "2026-09-10", categoryId: 2 },
        { ...base, occurredOn: "2026-10-10", categoryId: null },
        { ...base, occurredOn: "2026-11-10", categoryId: 2 },
      ],
      templates: [],
      asOf: "2026-11-12",
    });
    expect(suggestion.categoryId).toBe(2);
  });
});
