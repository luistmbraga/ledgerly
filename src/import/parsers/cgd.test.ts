import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reconcileRunningBalance } from "@/domain/import-reconcile";
import { cgdMovimentosParser } from "./cgd";
import { findParser } from "./index";

const fixture = fs.readFileSync(path.join(__dirname, "__fixtures__/cgd-movimentos.txt"), "utf-8");

describe("cgd-movimentos parser", () => {
  const statement = cgdMovimentosParser.parse(fixture);

  it("is detected from the statement text", () => {
    expect(findParser(fixture)?.id).toBe("cgd-movimentos");
    expect(findParser("Some other bank statement")).toBeNull();
  });

  it("reads the header", () => {
    expect(statement.closingBalanceCents).toBe(548_555);
    expect(statement.periodFrom).toBe("2026-08-13");
    expect(statement.periodTo).toBe("2026-11-10");
    expect(statement.currency).toBe("EUR");
    expect(statement.holderName).toBe("ANA MARIA SOUSA COSTA");
  });

  it("reads every movement, oldest first, without issues", () => {
    expect(statement.rows).toHaveLength(114);
    expect(statement.rows.every((r) => r.issue === null)).toBe(true);
    expect(statement.rows[0]).toMatchObject({
      position: 1,
      occurredOn: "2026-08-14",
      description: "TRF Booking com BV",
      amountCents: 29_427,
      balanceCents: 950_837,
    });
    expect(statement.rows.at(-1)).toMatchObject({
      occurredOn: "2026-11-06",
      postedOn: "2026-11-09",
      amountCents: -13_675,
      balanceCents: 548_555,
    });
  });

  it("dates card purchases by value date", () => {
    const leroy = statement.rows.find((r) => r.postedOn === "2026-10-28" && r.description === "LEROY MERLIN BRAGA");
    expect(leroy?.occurredOn).toBe("2026-10-16");
  });

  it("reconciles the full running-balance chain to the closing balance", () => {
    expect(reconcileRunningBalance(statement.rows, statement.closingBalanceCents)).toMatchObject({
      status: "ok",
      closingMatches: true,
      openingBalanceCents: 921_410,
    });
  });

  it("pinpoints the first row that no longer follows when a line is missing", () => {
    const lines = fixture.split("\n");
    const removed = lines.findIndex((l) => l.includes("CONTINENTE -60,27"));
    const broken = cgdMovimentosParser.parse(lines.filter((_, i) => i !== removed).join("\n"));
    const result = reconcileRunningBalance(broken.rows, broken.closingBalanceCents);
    expect(result).toMatchObject({ status: "broken", differenceCents: -6_027 });
    if (result.status === "broken") {
      expect(broken.rows[result.position - 1].description).toBe("Imposto de Selo");
    }
  });

  it("marks a line with a malformed amount instead of guessing", () => {
    const text = fixture.replace("CONTINENTE -60,27 5.430,41", "CONTINENTE -60,2x7 5.430,41");
    const row = cgdMovimentosParser.parse(text).rows.find((r) => r.description.includes("CONTINENTE -60,2x7"));
    expect(row?.issue).toMatch(/could not be read/);
    expect(row?.amountCents).toBeNull();
  });
});

describe.skipIf(!process.env.LEDGERLY_CGD_SAMPLE)("cgd-movimentos parser on the real PDF", () => {
  it("parses and reconciles", async () => {
    const { extractPdfText } = await import("../pdf-text");
    const bytes = new Uint8Array(fs.readFileSync(process.env.LEDGERLY_CGD_SAMPLE!));
    const extracted = await extractPdfText(bytes);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const statement = cgdMovimentosParser.parse(extracted.text);
    expect(statement.rows.length).toBeGreaterThan(0);
    expect(reconcileRunningBalance(statement.rows, statement.closingBalanceCents).status).toBe("ok");
  });
});
