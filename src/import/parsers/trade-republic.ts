import { parseBankAmount, parseBankDate } from "@/lib/bank-amount";
import type { ParsedStatement, StatementParser, StatementRow } from "../types";
import { readChainedLine, type AmountFormat } from "./running-balance";

const AMOUNT = String.raw`\d{1,3}(?: \d{3})*,\d{2}`;
const MONTHS: Record<string, string> = {
  jan: "01",
  fev: "02",
  mar: "03",
  abr: "04",
  mai: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  set: "09",
  out: "10",
  nov: "11",
  dez: "12",
};
const MONTH = `(${Object.keys(MONTHS).join("|")})\\.`;
const PERIOD = new RegExp(`^DATA (\\d{2}) ${MONTH} (\\d{4}) - (\\d{2}) ${MONTH} (\\d{4})$`);
const SUMMARY = new RegExp(
  `^Conta corrente (-?${AMOUNT}) € (${AMOUNT}) € (${AMOUNT}) € (-?${AMOUNT}) €$`,
);
const MOVEMENT_START = new RegExp(`^\\d{2} ${MONTH}(?: |$)`);
const MOVEMENT = new RegExp(`^(\\d{2}) ${MONTH} (\\d{4}) (.+)$`);
const MOVEMENT_END = new RegExp(`${AMOUNT} € -?${AMOUNT} €$`);
const PAGE_HEADER = /^TRADE REPUBLIC BANK GMBH, SUCURSAL/;
const PAGE_FOOTER = /^Gerado no dia .* Página \d+ de \d+$/;
const COLUMN_HEADER = new Set(["DATA TIPO DESCRIÇÃO ENTRADA DE", "DINHEIRO", "SAÍDA DE", "DINHEIRO SALDO"]);
// Movement types printed before the description, longest first.
const TYPES = [
  "Transação com cartão",
  "Transferência",
  "Levantamento",
  "Rendimentos",
  "Comércio",
  "Juros",
  "Bónus",
];

function cents(raw: string): number | null {
  const parsed = parseBankAmount(raw, { decimal: "," });
  return parsed.ok ? parsed.cents : null;
}

const FORMAT: AmountFormat = { amount: AMOUNT, parse: cents, marker: "€" };

function isoDate(day: string, month: string, year: string): string | null {
  return parseBankDate(`${year}-${MONTHS[month]}-${day}`, "YYYY-MM-DD");
}

function withoutType(description: string): string {
  const type = TYPES.find((t) => description.startsWith(`${t} `));
  return type ? description.slice(type.length + 1) : description;
}

/** The transactions table, with page headers, footers and repeated column headers removed. */
function transactionLines(lines: readonly string[]): string[] {
  const start = lines.indexOf("TRANSAÇÕES");
  if (start === -1) return [];
  const out: string[] = [];
  let inPageHeader = false;
  for (const line of lines.slice(start + 1)) {
    if (line === "SÍNTESE DO BALANÇO") break;
    if (PAGE_HEADER.test(line)) {
      inPageHeader = true;
      continue;
    }
    if (inPageHeader) {
      if (PAGE_FOOTER.test(line)) inPageHeader = false;
      continue;
    }
    if (COLUMN_HEADER.has(line) || line === "TRANSAÇÕES") continue;
    out.push(line);
  }
  return out;
}

export const tradeRepublicExtratoParser: StatementParser = {
  id: "trade-republic-extrato",
  label: "Trade Republic — Account statement",

  detect(text) {
    return text.includes("TRADE REPUBLIC BANK GMBH") && text.includes("RESUMO DO EXTRATO DE CONTA");
  },

  parse(text): ParsedStatement {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);

    const bicIndex = lines.findIndex((line) => line.startsWith("BIC "));
    const holderName = bicIndex !== -1 && bicIndex + 1 < lines.length ? lines[bicIndex + 1] : null;

    let periodFrom: string | null = null;
    let periodTo: string | null = null;
    const period = lines.map((line) => PERIOD.exec(line)).find(Boolean);
    if (period) {
      periodFrom = isoDate(period[1], period[2], period[3]);
      periodTo = isoDate(period[4], period[5], period[6]);
    }

    const summary = lines.map((line) => SUMMARY.exec(line)).find(Boolean);
    const openingBalanceCents = summary ? cents(summary[1]) : null;
    const closingBalanceCents = summary ? cents(summary[4]) : null;

    // Group lines into movements: a "DD mmm." line opens one, a line ending in
    // "<amount> € <balance> €" closes it.
    const groups: string[] = [];
    let buffer: string[] = [];
    for (const line of transactionLines(lines)) {
      if (MOVEMENT_START.test(line) && buffer.length > 0) {
        groups.push(buffer.join(" "));
        buffer = [];
      }
      if (buffer.length === 0 && !MOVEMENT_START.test(line)) continue;
      buffer.push(line);
      if (MOVEMENT_END.test(buffer.join(" "))) {
        groups.push(buffer.join(" "));
        buffer = [];
      }
    }
    if (buffer.length > 0) groups.push(buffer.join(" "));

    const rows: StatementRow[] = [];
    let previous = openingBalanceCents;
    for (const group of groups) {
      const position = rows.length + 1;
      const movement = MOVEMENT.exec(group);
      const occurredOn = movement ? isoDate(movement[1], movement[2], movement[3]) : null;
      const tail = movement ? movement[4] : group;
      const read = readChainedLine(tail, previous, FORMAT);

      if (!read.ok) {
        rows.push({
          position,
          occurredOn,
          postedOn: occurredOn,
          description: withoutType(tail),
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
        postedOn: occurredOn,
        description: withoutType(read.description),
        amountCents: read.amountCents,
        balanceCents: read.balanceCents,
        issue:
          occurredOn === null
            ? "The date on this line is not valid."
            : read.amountCents === 0
              ? "The amount on this line is not valid."
              : null,
      });
      previous = read.balanceCents;
    }

    const notes: string[] = [];
    if (lines.some((line) => line.startsWith("FUNDOS DO MERCADO MONETÁRIO"))) {
      notes.push("Money market fund movements were not imported; they are internal to your Trade Republic account.");
    }

    return {
      parserId: this.id,
      label: this.label,
      currency: "EUR",
      periodFrom,
      periodTo,
      openingBalanceCents,
      closingBalanceCents,
      notes,
      holderName,
      rows,
    };
  },
};
