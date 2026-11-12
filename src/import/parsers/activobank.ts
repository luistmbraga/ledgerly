import { parseBankAmount, parseBankDate } from "@/lib/bank-amount";
import type { ParsedStatement, StatementParser, StatementRow } from "../types";
import { readChainedLine, type AmountFormat } from "./running-balance";

const AMOUNT = String.raw`\d{1,3}(?: \d{3})*\.\d{2}`;
const MOVEMENT = /^(\d{2})\.(\d{2}) (\d{2})\.(\d{2}) (.+)$/;
const SECTION = /^CONTA .+ MOEDA: ([A-Z]{3})$/;
const PERIOD = /^EXTRATO DE (\d{4})\/(\d{2})\/(\d{2}) A (\d{4})\/(\d{2})\/(\d{2})$/;
const OPENING = new RegExp(`^SALDO INICIAL (-?${AMOUNT})$`);
const CLOSING = new RegExp(`^SALDO FINAL (-?${AMOUNT})$`);

function cents(raw: string): number | null {
  const parsed = parseBankAmount(raw, { decimal: "." });
  return parsed.ok ? parsed.cents : null;
}

const FORMAT: AmountFormat = { amount: AMOUNT, parse: cents };

function yearFor(month: number, from: { year: number; month: number }, to: { year: number; month: number }) {
  if (from.year === to.year) return from.year;
  return month >= from.month ? from.year : to.year;
}

export const activobankExtratoParser: StatementParser = {
  id: "activobank-extrato",
  label: "ActivoBank — Extrato Combinado",

  detect(text) {
    return text.includes("ActivoBank") && text.includes("EXTRATO COMBINADO");
  },

  parse(text): ParsedStatement {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);

    const holderLine = lines.map((line) => /^#S#(.+)#E#$/.exec(line)?.[1]?.trim()).find(Boolean);
    const sectionIndexes = lines.flatMap((line, i) => (SECTION.test(line) ? [i] : []));
    const notes: string[] = [];
    if (sectionIndexes.length > 1) {
      notes.push(
        `This statement has ${sectionIndexes.length} account sections. Only the first (${lines[sectionIndexes[0]]}) was read.`,
      );
    }

    const start = sectionIndexes[0] ?? 0;
    const currency = sectionIndexes.length > 0 ? SECTION.exec(lines[start])![1] : "EUR";

    let periodFrom: string | null = null;
    let periodTo: string | null = null;
    let from = { year: 0, month: 0 };
    let to = { year: 0, month: 0 };
    let openingBalanceCents: number | null = null;
    let closingBalanceCents: number | null = null;
    const rows: StatementRow[] = [];
    let previous: number | null = null;
    let inMovements = false;

    for (const line of lines.slice(start)) {
      const period = PERIOD.exec(line);
      if (period && periodFrom === null) {
        periodFrom = parseBankDate(`${period[1]}-${period[2]}-${period[3]}`, "YYYY-MM-DD");
        periodTo = parseBankDate(`${period[4]}-${period[5]}-${period[6]}`, "YYYY-MM-DD");
        from = { year: Number(period[1]), month: Number(period[2]) };
        to = { year: Number(period[4]), month: Number(period[5]) };
        continue;
      }
      const opening = OPENING.exec(line);
      if (opening && !inMovements) {
        openingBalanceCents = cents(opening[1]);
        previous = openingBalanceCents;
        inMovements = true;
        continue;
      }
      if (!inMovements) continue;
      const closing = CLOSING.exec(line);
      if (closing) {
        closingBalanceCents = cents(closing[1]);
        break;
      }

      const movement = MOVEMENT.exec(line);
      if (!movement) continue;
      const [, postedMonth, postedDay, valueMonth, valueDay, tail] = movement;
      const date = (month: string, day: string) =>
        periodFrom === null
          ? null
          : parseBankDate(`${yearFor(Number(month), from, to)}-${month}-${day}`, "YYYY-MM-DD");
      const occurredOn = date(valueMonth, valueDay);
      const postedOn = date(postedMonth, postedDay);

      const read = readChainedLine(tail, previous, FORMAT);
      const position = rows.length + 1;

      if (!read.ok) {
        rows.push({
          position,
          occurredOn,
          postedOn,
          description: tail,
          amountCents: null,
          balanceCents: read.balanceCents,
          issue: "This line could not be read as a movement that follows from the previous balance.",
        });
        if (read.balanceCents !== null) previous = read.balanceCents;
        continue;
      }

      rows.push({
        position,
        occurredOn,
        postedOn,
        description: read.description,
        amountCents: read.amountCents,
        balanceCents: read.balanceCents,
        issue:
          occurredOn === null || postedOn === null
            ? "The date on this line is not valid."
            : read.amountCents === 0
              ? "The amount on this line is not valid."
              : null,
      });
      previous = read.balanceCents;
    }

    return {
      parserId: this.id,
      label: this.label,
      currency,
      periodFrom,
      periodTo,
      openingBalanceCents,
      closingBalanceCents,
      notes,
      holderName: holderLine ?? null,
      rows,
    };
  },
};
