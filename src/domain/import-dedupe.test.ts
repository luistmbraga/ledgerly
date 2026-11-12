import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cgdMovimentosParser } from "@/import/parsers/cgd";
import { flagCandidates, isInvestmentTrade, isOwnTransfer, type ExistingJournalRow } from "./import-dedupe";
import {
  buildCategorySuggester,
  normalizeDescription,
  toCandidates,
  type ImportCandidate,
} from "./import-normalize";

const fixture = fs.readFileSync(
  path.join(__dirname, "../import/parsers/__fixtures__/cgd-movimentos.txt"),
  "utf-8",
);
const statement = cgdMovimentosParser.parse(fixture);
const candidates = toCandidates(statement.rows);

function row(overrides: Partial<ExistingJournalRow>): ExistingJournalRow {
  return {
    id: 1,
    kind: "expense",
    amountCents: 1_000,
    occurredOn: "2026-10-01",
    note: null,
    importFingerprint: null,
    recurringTemplateId: null,
    recurringPeriod: null,
    ...overrides,
  };
}

function candidate(position: number, overrides: Partial<ImportCandidate>): ImportCandidate {
  const base = toCandidates([
    { position, occurredOn: "2026-10-01", description: "CONTINENTE", amountCents: -1_000, issue: null },
  ])[0];
  return { ...base, ...overrides };
}

describe("normalizeDescription", () => {
  it("strips movement prefixes, accents and case", () => {
    expect(normalizeDescription("COMPRAS C.DEB  IKEA BR")).toBe("ikea br");
    expect(normalizeDescription("Trf Mbway 900XXX001")).toBe("900xxx001");
    expect(normalizeDescription("TFI RITA GOMES ALVES")).toBe("rita gomes alves");
    expect(normalizeDescription("Imposto de Sêlo")).toBe("imposto de selo");
  });

  it("strips ActivoBank prefixes and card digits", () => {
    expect(normalizeDescription("COMPRA 7526 IKEA BRAGA")).toBe("ikea braga");
    expect(normalizeDescription("CRED. 7526 STRIPE IRELAND")).toBe("stripe ireland");
    expect(normalizeDescription("LEV ATM 7526 CGD Braga")).toBe("cgd braga");
    expect(normalizeDescription("TRF MB WAY P/ RUI COSTA")).toBe("rui costa");
    expect(normalizeDescription("TRF. P/O ANA COSTA")).toBe("ana costa");
    expect(normalizeDescription("TRF P/ Ana Costa")).toBe("ana costa");
  });

  it("strips Trade Republic transfer prefixes", () => {
    expect(normalizeDescription("Incoming transfer from ANA COSTA (PT50000000000000000000002)")).toBe(
      "ana costa (pt50000000000000000000002)",
    );
    expect(normalizeDescription("Outgoing transfer to Ana Costa")).toBe("ana costa");
  });
});

describe("toCandidates", () => {
  it("turns signs into kinds with positive amounts", () => {
    const [income, expense] = toCandidates([
      { position: 1, occurredOn: "2026-10-01", description: "TRF OLX", amountCents: 308_511, issue: null },
      { position: 2, occurredOn: "2026-10-01", description: "CONTINENTE", amountCents: -6_027, issue: null },
    ]);
    expect(income).toMatchObject({ kind: "income", amountCents: 308_511 });
    expect(expense).toMatchObject({ kind: "expense", amountCents: 6_027 });
  });

  it("keeps identical same-day rows distinct with an occurrence index", () => {
    const rows = [1, 2].map((position) => ({
      position,
      occurredOn: "2026-10-01",
      description: "C CLASSIC",
      amountCents: -899,
      issue: null,
    }));
    const [a, b] = toCandidates(rows);
    expect(a.fingerprint).toBe("2026-10-01|899|expense|c classic|1");
    expect(b.fingerprint).toBe("2026-10-01|899|expense|c classic|2");
  });

  it("gives rows with issues no fingerprint", () => {
    const [bad] = toCandidates([
      { position: 1, occurredOn: null, description: "garbled", amountCents: null, issue: "bad" },
    ]);
    expect(bad.fingerprint).toBeNull();
  });
});

describe("flagCandidates on the CGD fixture", () => {
  const flags = flagCandidates({
    candidates,
    existing: [],
    templates: [],
    holderName: statement.holderName,
  });
  const flagged = (type: string) =>
    candidates.filter((c) => flags.get(c.position)?.type === type).map((c) => c.description);

  it("flags own-account transfers", () => {
    expect(flagged("own_transfer")).toEqual([
      "TRF Ana Maria Sousa C",
      "TRF Ana Maria Sousa C",
      "TRF Ana Maria Sousa C",
    ]);
  });

  it("pairs the same-day ±1.500 Vi Tr movements with each other", () => {
    const viTr = candidates.filter((c) => c.normalizedDescription === "vi tr");
    expect(viTr).toHaveLength(2);
    const [a, b] = viTr.map((c) => flags.get(c.position));
    expect(a).toMatchObject({ type: "offsetting_pair", pairPosition: viTr[1].position });
    expect(b).toMatchObject({ type: "offsetting_pair", pairPosition: viTr[0].position });
  });

  it("flags every row as an exact duplicate when the same statement is imported again", () => {
    const existing = candidates.map((c, i) =>
      row({
        id: i + 1,
        kind: c.kind,
        amountCents: c.amountCents!,
        occurredOn: c.occurredOn!,
        importFingerprint: c.fingerprint,
      }),
    );
    const again = flagCandidates({ candidates, existing, templates: [], holderName: statement.holderName });
    expect(candidates.every((c) => again.get(c.position)?.type === "exact")).toBe(true);
  });

  it("flags only the overlap of a later statement", () => {
    const firstHalf = candidates.filter((c) => c.occurredOn! < "2026-10-01");
    const existing = firstHalf.map((c, i) =>
      row({ id: i + 1, kind: c.kind, amountCents: c.amountCents!, occurredOn: c.occurredOn!, importFingerprint: c.fingerprint }),
    );
    const later = flagCandidates({ candidates, existing, templates: [], holderName: null });
    const exact = candidates.filter((c) => later.get(c.position)?.type === "exact");
    expect(exact.map((c) => c.position)).toEqual(firstHalf.map((c) => c.position));
  });
});

describe("flagCandidates matching journal rows", () => {
  it("flags a hand-entered row within 3 days, once", () => {
    const one = candidate(1, {});
    const two = candidate(2, { fingerprint: "other|1" });
    const flags = flagCandidates({
      candidates: [one, two],
      existing: [row({ id: 7, occurredOn: "2026-09-28" })],
      templates: [],
      holderName: null,
    });
    expect(flags.get(1)).toMatchObject({ type: "likely_manual", matchId: 7 });
    expect(flags.get(2)).toBeUndefined();
  });

  it("does not match a hand-entered row 4 days away", () => {
    const flags = flagCandidates({
      candidates: [candidate(1, {})],
      existing: [row({ occurredOn: "2026-09-27" })],
      templates: [],
      holderName: null,
    });
    expect(flags.size).toBe(0);
  });

  it("flags a variable bill already posted by its template via match text", () => {
    const endesa = candidate(1, {
      occurredOn: "2026-10-27",
      amountCents: 4_292,
      description: "ENDESA ENERGIA",
      normalizedDescription: "endesa energia",
      fingerprint: "x|1",
    });
    const posted = row({
      id: 3,
      amountCents: 6_000,
      occurredOn: "2026-10-25",
      recurringTemplateId: 9,
      recurringPeriod: "2026-10",
    });
    const withText = flagCandidates({
      candidates: [endesa],
      existing: [posted],
      templates: [{ id: 9, kind: "expense", cadence: "monthly", matchText: "Endesa" }],
      holderName: null,
    });
    expect(withText.get(1)).toMatchObject({ type: "likely_recurring", matchId: 3 });

    const byAmount = flagCandidates({
      candidates: [endesa],
      existing: [posted],
      templates: [{ id: 9, kind: "expense", cadence: "monthly", matchText: null }],
      holderName: null,
    });
    expect(byAmount.size).toBe(0);
  });

  it("matches a recurring row by amount within 20% when there is no match text", () => {
    const flags = flagCandidates({
      candidates: [candidate(1, { occurredOn: "2026-10-27", amountCents: 4_292, fingerprint: "x|1" })],
      existing: [row({ id: 3, amountCents: 4_500, recurringTemplateId: 9, recurringPeriod: "2026-10" })],
      templates: [{ id: 9, kind: "expense", cadence: "monthly", matchText: null }],
      holderName: null,
    });
    expect(flags.get(1)?.type).toBe("likely_recurring");
  });
});

describe("isOwnTransfer", () => {
  it("needs a meaningful prefix of the holder's name", () => {
    expect(isOwnTransfer("ana maria sousa c", "ANA MARIA SOUSA COSTA")).toBe(true);
    expect(isOwnTransfer("ana", "ANA MARIA SOUSA COSTA")).toBe(false);
    expect(isOwnTransfer("rita alves", "ANA MARIA SOUSA COSTA")).toBe(false);
    expect(isOwnTransfer("ana maria sousa c", null)).toBe(false);
  });
});

describe("investment trades", () => {
  it("recognises broker trade rows only", () => {
    expect(isInvestmentTrade("buy trade ie0000vitht2 ishares")).toBe(true);
    expect(isInvestmentTrade("sell trade ie0000vitht2 ishares")).toBe(true);
    expect(isInvestmentTrade("savings plan execution ie00b4l5y983")).toBe(true);
    expect(isInvestmentTrade("buy trades magazine")).toBe(false);
    expect(isInvestmentTrade("continente buy trade")).toBe(false);
  });

  it("flags a trade unticked unless a stronger flag already applies", () => {
    const trade = candidate(1, { description: "Buy trade IE0000VITHT2", normalizedDescription: "buy trade ie0000vitht2" });
    const flags = flagCandidates({ candidates: [trade], existing: [], templates: [], holderName: null });
    expect(flags.get(1)).toMatchObject({ type: "investment_trade" });

    const existing = [row({ id: 7, importFingerprint: trade.fingerprint })];
    const again = flagCandidates({ candidates: [trade], existing, templates: [], holderName: null });
    expect(again.get(1)).toMatchObject({ type: "exact" });
  });
});

describe("buildCategorySuggester", () => {
  const categories = {
    expense: [
      { id: 1, name: "Groceries" },
      { id: 2, name: "Shopping" },
    ],
    income: [{ id: 10, name: "Salary" }],
  };

  it("reuses the latest category for the same description, then keywords, else none", () => {
    const suggest = buildCategorySuggester({
      history: [
        { kind: "expense", occurredOn: "2026-09-01", categoryId: 2, note: "CONTINENTE" },
        { kind: "expense", occurredOn: "2026-10-01", categoryId: 1, note: "COMPRAS C.DEB CONTINENTE" },
        { kind: "income", occurredOn: "2026-10-01", categoryId: 10, note: "TRF OLX PORTUGAL SA" },
      ],
      categories,
      asOf: "2026-11-12",
    });
    const ask = (kind: "expense" | "income", description: string) =>
      suggest({ kind, description, normalizedDescription: normalizeDescription(description) });

    expect(ask("expense", "CONTINENTE")).toBe(1);
    expect(ask("income", "TRF OLX PORTUGAL SA")).toBe(10);
    expect(ask("expense", "WWW.AMAZON B89H89M04")).toBe(2);
    expect(ask("expense", "TALHO SANTIAGO")).toBeNull();
  });

  it("suggests Investment income for interest and dividends, only among income categories", () => {
    const suggest = buildCategorySuggester({
      history: [],
      categories: { ...categories, income: [...categories.income, { id: 11, name: "Investment income" }] },
      asOf: "2026-11-12",
    });
    const ask = (kind: "expense" | "income", description: string) =>
      suggest({ kind, description, normalizedDescription: normalizeDescription(description) });

    expect(ask("income", "Interest payment")).toBe(11);
    expect(ask("income", "Dividend IE0000VITHT2")).toBe(11);
    expect(ask("income", "JUROS CREDORES")).toBe(11);
    expect(ask("expense", "Interest payment")).toBeNull();
  });
});

describe("flagCandidates matching recurring entries near a month boundary", () => {
  const template = { id: 9, kind: "expense" as const, cadence: "monthly" as const, matchText: "ENDESA" };
  const bank = (occurredOn: string) =>
    candidate(1, {
      occurredOn,
      amountCents: 4_389,
      description: "ENDESA ENERGIA",
      normalizedDescription: "endesa energia",
      fingerprint: `${occurredOn}|1`,
    });
  const posted = (id: number, occurredOn: string) =>
    row({ id, amountCents: 4_500, occurredOn, recurringTemplateId: 9, recurringPeriod: occurredOn.slice(0, 7) });

  it("matches a template entry within 5 days in another month, with its amount and date", () => {
    const flags = flagCandidates({
      candidates: [bank("2026-12-01")],
      existing: [posted(3, "2026-11-30")],
      templates: [template],
      holderName: null,
    });
    expect(flags.get(1)).toMatchObject({
      type: "likely_recurring",
      matchId: 3,
      matchAmountCents: 4_500,
      matchOccurredOn: "2026-11-30",
    });
  });

  it("does not match 6 days away across a month boundary", () => {
    const flags = flagCandidates({
      candidates: [bank("2026-12-06")],
      existing: [posted(3, "2026-11-30")],
      templates: [template],
      holderName: null,
    });
    expect(flags.size).toBe(0);
  });

  it("prefers the closest entry", () => {
    const flags = flagCandidates({
      candidates: [bank("2026-12-01")],
      existing: [posted(3, "2026-12-20"), posted(4, "2026-11-29")],
      templates: [template],
      holderName: null,
    });
    expect(flags.get(1)).toMatchObject({ type: "likely_recurring", matchId: 4 });
  });
});
