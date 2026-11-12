import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flagCandidates } from "@/domain/import-dedupe";
import { planCashLinks } from "@/domain/import-links";
import { toCandidates } from "@/domain/import-normalize";
import { reconcileRunningBalance } from "@/domain/import-reconcile";
import { activobankExtratoParser } from "./activobank";
import { cgdMovimentosParser } from "./cgd";
import { findParser } from "./index";

const fixture = fs.readFileSync(path.join(__dirname, "__fixtures__/activobank-extrato.txt"), "utf-8");
const cgdFixture = fs.readFileSync(path.join(__dirname, "__fixtures__/cgd-movimentos.txt"), "utf-8");

describe("activobank-extrato parser", () => {
  const statement = activobankExtratoParser.parse(fixture);

  it("is detected, and the two bank parsers don't claim each other's text", () => {
    expect(findParser(fixture)?.id).toBe("activobank-extrato");
    expect(findParser(cgdFixture)?.id).toBe("cgd-movimentos");
    expect(cgdMovimentosParser.detect(fixture)).toBe(false);
    expect(activobankExtratoParser.detect(cgdFixture)).toBe(false);
  });

  it("reads the header and balances", () => {
    expect(statement).toMatchObject({
      currency: "EUR",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-30",
      openingBalanceCents: 222_479,
      closingBalanceCents: 205_659,
      holderName: "ANA MARIA SOUSA COSTA",
      notes: [],
    });
  });

  it("reads all 26 movements with direction taken from the running balance", () => {
    expect(statement.rows).toHaveLength(26);
    expect(statement.rows.every((r) => r.issue === null)).toBe(true);
    expect(statement.rows.find((r) => r.description === "TRF. P/O ANA MARIA SOUSA COSTA")).toMatchObject({
      occurredOn: "2026-10-26",
      amountCents: 202_700,
      balanceCents: 375_888,
    });
    expect(statement.rows.find((r) => r.description.includes("RAY-BAN.COM 866-472-9226"))).toMatchObject({
      occurredOn: "2026-10-13",
      amountCents: -13_700,
    });
  });

  it("reconciles from the printed opening balance to the closing balance", () => {
    expect(
      reconcileRunningBalance(statement.rows, statement.closingBalanceCents, statement.openingBalanceCents),
    ).toMatchObject({ status: "ok", closingMatches: true, openingBalanceCents: 222_479 });
  });

  it("names row 1 when the first movement doesn't follow from the opening balance", () => {
    const text = fixture.replace("SALDO INICIAL 2 224.79", "SALDO INICIAL 2 224.78");
    const broken = activobankExtratoParser.parse(text);
    expect(broken.rows[0].issue).not.toBeNull();
  });

  it("uses the balance chain to split amounts when the description ends in digits", () => {
    const text = fixture.replace(
      "10.02 10.02 COMPRA 0000 STRIPE IRELAND 49.99 2 174.80",
      "10.02 10.02 COMPRA 0000 LOJA 12 49.99 2 174.80",
    );
    const row = activobankExtratoParser.parse(text).rows[0];
    expect(row).toMatchObject({ description: "COMPRA 0000 LOJA 12", amountCents: -4_999, issue: null });

    const thousands = fixture.replace(
      "SALDO INICIAL 2 224.79",
      "SALDO INICIAL 14 569.79",
    ).replace("10.02 10.02 COMPRA 0000 STRIPE IRELAND 49.99 2 174.80", "10.02 10.02 COMPRA 0000 LOJA 12 345.00 2 224.79");
    expect(activobankExtratoParser.parse(thousands).rows[0]).toMatchObject({
      description: "COMPRA 0000 LOJA",
      amountCents: -1_234_500,
    });
  });

  it("marks a line that cannot follow from the previous balance", () => {
    const text = fixture.replace("COMPRA 0000 GOG Sp. Z o.o Warsaw 2.49 1 958.21", "COMPRA 0000 GOG Sp. Z o.o Warsaw 2.49 1 958.11");
    const parsed = activobankExtratoParser.parse(text);
    const bad = parsed.rows.find((r) => r.description.includes("GOG"));
    expect(bad?.issue).toMatch(/could not be read/);
    expect(bad?.amountCents).toBeNull();
  });

  it("puts dates in the right year when a statement crosses the year end", () => {
    const text = fixture
      .replace("EXTRATO DE 2026/10/01 A 2026/10/30", "EXTRATO DE 2026/12/15 A 2027/01/14")
      .replace("10.02 10.02 COMPRA 0000 STRIPE", "12.20 12.20 COMPRA 0000 STRIPE")
      .replace("10.02 10.02 CRED. 0000 STRIPE", "01.03 01.03 CRED. 0000 STRIPE");
    const rows = activobankExtratoParser.parse(text).rows;
    expect(rows[0].occurredOn).toBe("2026-12-20");
    expect(rows[1].occurredOn).toBe("2027-01-03");
  });

  it("notes when a statement has more than one account section", () => {
    const text = fixture.replace("SALDO FINAL", "CONTA POUPANCA N. 2 MOEDA: EUR\nSALDO FINAL");
    expect(activobankExtratoParser.parse(text).notes[0]).toMatch(/2 account sections/);
  });
});

describe("activobank flags and balance updates", () => {
  const statement = activobankExtratoParser.parse(fixture);
  const candidates = toCandidates(statement.rows);
  const flags = flagCandidates({ candidates, existing: [], templates: [], holderName: statement.holderName });
  const byDescription = (text: string) => candidates.filter((c) => c.description.includes(text));

  it("flags both own-account transfers", () => {
    const own = candidates.filter((c) => flags.get(c.position)?.type === "own_transfer").map((c) => c.description);
    expect(own).toEqual(["TRF. P/O ANA MARIA SOUSA COSTA", "TRF P/ Ana Maria Sousa Costa"]);
  });

  it("does not flag MB WAY payments to other people", () => {
    for (const c of byDescription("TRF MB WAY")) expect(flags.get(c.position)).toBeUndefined();
  });

  it("pairs the Stripe purchase with its same-day refund", () => {
    const [purchase, refund] = byDescription("STRIPE IRELAND");
    expect(flags.get(purchase.position)).toMatchObject({ type: "offsetting_pair", pairPosition: refund.position });
  });

  it("flags every row as already imported on a second import", () => {
    const existing = candidates.map((c, i) => ({
      id: i + 1,
      kind: c.kind,
      amountCents: c.amountCents!,
      occurredOn: c.occurredOn!,
      note: c.description,
      importFingerprint: c.fingerprint,
      recurringTemplateId: null,
      recurringPeriod: null,
    }));
    const again = flagCandidates({ candidates, existing, templates: [], holderName: statement.holderName });
    expect(candidates.every((c) => again.get(c.position)?.type === "exact")).toBe(true);
  });

  it("skips the closing balance when the account already has a later balance", () => {
    const plan = planCashLinks({
      mode: "closing",
      rows: [],
      latest: { recordedOn: "2026-11-07", amountCents: 189_570 },
      closingBalanceCents: statement.closingBalanceCents,
      periodTo: statement.periodTo,
    });
    expect(plan.closing).toBe("skip_newer");
  });
});

describe.skipIf(!process.env.LEDGERLY_ACTIVOBANK_SAMPLE)("activobank-extrato parser on the real PDF", () => {
  it("parses and reconciles", async () => {
    const { extractPdfText } = await import("../pdf-text");
    const bytes = new Uint8Array(fs.readFileSync(process.env.LEDGERLY_ACTIVOBANK_SAMPLE!));
    const extracted = await extractPdfText(bytes);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const statement = activobankExtratoParser.parse(extracted.text);
    expect(statement.rows.length).toBeGreaterThan(0);
    expect(
      reconcileRunningBalance(statement.rows, statement.closingBalanceCents, statement.openingBalanceCents).status,
    ).toBe("ok");
  });
});
