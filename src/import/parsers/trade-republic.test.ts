import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flagCandidates } from "@/domain/import-dedupe";
import { toCandidates } from "@/domain/import-normalize";
import { reconcileRunningBalance } from "@/domain/import-reconcile";
import { activobankExtratoParser } from "./activobank";
import { cgdMovimentosParser } from "./cgd";
import { findParser } from "./index";
import { tradeRepublicExtratoParser } from "./trade-republic";

const read = (name: string) => fs.readFileSync(path.join(__dirname, "__fixtures__", name), "utf-8");
const fixture = read("trade-republic-extrato.txt");
const cgdFixture = read("cgd-movimentos.txt");
const activobankFixture = read("activobank-extrato.txt");

const PAGE_BREAK = [
  "TRADE REPUBLIC BANK GMBH, SUCURSAL EM PORTUGAL AV. DA REPÚBLICA 50, 1050-196 LISBOA, PORTUGAL",
  "Trade Republic Bank GmbH, Sucursal em Portugal",
  "NIPC number: 980876311",
  "Gerado no dia 2026-11-10 09:07:55 Europe/Lisbon (UTC+00:00) Página 2 de 3",
  "DATA TIPO DESCRIÇÃO ENTRADA DE",
  "DINHEIRO",
  "SAÍDA DE",
  "DINHEIRO SALDO",
].join("\n");

describe("trade-republic-extrato parser", () => {
  const statement = tradeRepublicExtratoParser.parse(fixture);

  it("is detected, and no bank parser claims another bank's text", () => {
    expect(findParser(fixture)?.id).toBe("trade-republic-extrato");
    expect(findParser(cgdFixture)?.id).toBe("cgd-movimentos");
    expect(findParser(activobankFixture)?.id).toBe("activobank-extrato");
    expect(cgdMovimentosParser.detect(fixture)).toBe(false);
    expect(activobankExtratoParser.detect(fixture)).toBe(false);
    expect(tradeRepublicExtratoParser.detect(cgdFixture)).toBe(false);
    expect(tradeRepublicExtratoParser.detect(activobankFixture)).toBe(false);
  });

  it("reads the header, balances and holder", () => {
    expect(statement).toMatchObject({
      currency: "EUR",
      periodFrom: "2026-08-01",
      periodTo: "2026-11-09",
      openingBalanceCents: 1_708_640,
      closingBalanceCents: 2_069_166,
      holderName: "ANA MARIA SOUSA COSTA",
    });
    expect(statement.notes).toEqual([expect.stringMatching(/Money market fund movements were not imported/)]);
  });

  it("reads all 8 movements, joining wrapped lines, with direction from the running balance", () => {
    expect(statement.rows).toHaveLength(8);
    expect(statement.rows.every((r) => r.issue === null)).toBe(true);
    expect(statement.rows[0]).toMatchObject({
      occurredOn: "2026-08-01",
      postedOn: "2026-08-01",
      description: "Interest payment",
      amountCents: 2_304,
      balanceCents: 1_710_944,
    });
    expect(statement.rows[1]).toMatchObject({
      occurredOn: "2026-08-26",
      description: "Incoming transfer from ANA MARIA SOUSA COSTA (PT50000000000000000000002)",
      amountCents: 200_000,
    });
    expect(statement.rows[7]).toMatchObject({
      occurredOn: "2026-11-04",
      amountCents: -150_107,
      balanceCents: 2_069_166,
    });
    expect(statement.rows[7].description).toMatch(/^Buy trade IE0000VITHT2 .* quantity: 331\.257453$/);
  });

  it("reconciles from the opening balance to the closing balance", () => {
    expect(
      reconcileRunningBalance(statement.rows, statement.closingBalanceCents, statement.openingBalanceCents),
    ).toMatchObject({ status: "ok", closingMatches: true, openingBalanceCents: 1_708_640 });
  });

  it("names row 1 when the first movement doesn't follow from the opening balance", () => {
    const broken = tradeRepublicExtratoParser.parse(
      fixture.replace("Conta corrente 17 086,40 €", "Conta corrente 17 086,41 €"),
    );
    expect(broken.rows[0].issue).toMatch(/could not be read/);
    expect(broken.rows[0].amountCents).toBeNull();
    expect(broken.rows.slice(1).every((r) => r.issue === null)).toBe(true);
  });

  it("reads a movement that is split across a page break", () => {
    const text = fixture.replace(
      "2026 Transferência Incoming transfer from ANA MARIA SOUSA COSTA\n(PT50000000000000000000002) 1 500,00 € 20 633,51 €",
      `2026 Transferência Incoming transfer from ANA MARIA SOUSA COSTA\n${PAGE_BREAK}\n(PT50000000000000000000002) 1 500,00 € 20 633,51 €`,
    );
    expect(text).not.toBe(fixture);
    const rows = tradeRepublicExtratoParser.parse(text).rows;
    expect(rows).toHaveLength(8);
    expect(rows[3]).toMatchObject({
      description: "Incoming transfer from ANA MARIA SOUSA COSTA (PT50000000000000000000002)",
      amountCents: 150_000,
      issue: null,
    });
  });

  it("uses the balance chain when the description ends in digits", () => {
    const text = fixture.replace(
      "2026 Juros Interest payment 23,04 € 17 109,44 €",
      "2026 Transação com cartão LOJA 12 23,04 € 17 109,44 €",
    );
    expect(tradeRepublicExtratoParser.parse(text).rows[0]).toMatchObject({
      description: "LOJA 12",
      amountCents: 2_304,
      issue: null,
    });
  });
});

describe("trade-republic flags", () => {
  const statement = tradeRepublicExtratoParser.parse(fixture);
  const candidates = toCandidates(statement.rows);
  const flags = flagCandidates({ candidates, existing: [], templates: [], holderName: statement.holderName });
  const typeAt = (i: number) => flags.get(candidates[i].position)?.type;

  it("flags the incoming transfers as own transfers and the buy trade as an investment trade", () => {
    expect([1, 3, 5].map(typeAt)).toEqual(["own_transfer", "own_transfer", "own_transfer"]);
    expect(typeAt(7)).toBe("investment_trade");
  });

  it("leaves the interest payments as unflagged income", () => {
    for (const i of [0, 2, 4, 6]) {
      expect(typeAt(i)).toBeUndefined();
      expect(candidates[i].kind).toBe("income");
    }
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
});

describe.skipIf(!process.env.LEDGERLY_TRADE_REPUBLIC_SAMPLE)("trade-republic-extrato parser on the real PDF", () => {
  it("parses and reconciles", async () => {
    const { extractPdfText } = await import("../pdf-text");
    const bytes = new Uint8Array(fs.readFileSync(process.env.LEDGERLY_TRADE_REPUBLIC_SAMPLE!));
    const extracted = await extractPdfText(bytes);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const statement = tradeRepublicExtratoParser.parse(extracted.text);
    expect(statement.rows.length).toBeGreaterThan(0);
    expect(
      reconcileRunningBalance(statement.rows, statement.closingBalanceCents, statement.openingBalanceCents).status,
    ).toBe("ok");
  });
});
