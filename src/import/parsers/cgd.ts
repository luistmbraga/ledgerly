import { parseBankAmount, parseBankDate } from "@/lib/bank-amount";
import type { ParsedStatement, StatementParser, StatementRow } from "../types";

const DATE = String.raw`\d{2}-\d{2}-\d{4}`;
const AMOUNT = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`;
const MOVEMENT = new RegExp(`^(${DATE}) (${DATE}) (.+?) (${AMOUNT}) (${AMOUNT})$`);
const STARTS_WITH_DATES = new RegExp(`^${DATE} ${DATE} `);

function amount(raw: string): number | null {
  const parsed = parseBankAmount(raw, { decimal: "," });
  return parsed.ok ? parsed.cents : null;
}

function readHeader(lines: string[]) {
  let holderName: string | null = null;
  let currency = "EUR";
  let closingBalanceCents: number | null = null;
  let periodFrom: string | null = null;
  let periodTo: string | null = null;

  for (const line of lines) {
    const holder = /^Cliente\s+(.+)$/.exec(line);
    if (holder && holderName === null) holderName = holder[1].trim();

    const account = /^Conta\s+\S+\s+-\s+([A-Z]{3})\s+-/.exec(line);
    if (account) currency = account[1];

    // The accented "í" in "contabilístico" does not extract reliably, so match the prefix.
    const closing = new RegExp(`^Saldo contabil\\S*\\s+(${AMOUNT})\\s*[A-Z]{3}$`).exec(line);
    if (closing && closingBalanceCents === null) closingBalanceCents = amount(closing[1]);

    // Text extraction can reorder this line ("Intervalo de a13-08-2026 10-11-2026").
    if (line.startsWith("Intervalo")) {
      const dates = line.match(new RegExp(DATE, "g")) ?? [];
      if (dates.length === 2) {
        periodFrom = parseBankDate(dates[0], "DD-MM-YYYY");
        periodTo = parseBankDate(dates[1], "DD-MM-YYYY");
      }
    }
  }
  return { holderName, currency, closingBalanceCents, periodFrom, periodTo };
}

function readRow(line: string): Omit<StatementRow, "position"> {
  const match = MOVEMENT.exec(line);
  if (!match) {
    return {
      occurredOn: null,
      postedOn: null,
      description: line,
      amountCents: null,
      balanceCents: null,
      issue: "This line could not be read as a movement.",
    };
  }
  const [, postedRaw, valueRaw, description, amountRaw, balanceRaw] = match;
  const postedOn = parseBankDate(postedRaw, "DD-MM-YYYY");
  const occurredOn = parseBankDate(valueRaw, "DD-MM-YYYY");
  const amountCents = amount(amountRaw);
  const balanceCents = amount(balanceRaw);
  const issue =
    postedOn === null || occurredOn === null
      ? "The date on this line is not valid."
      : amountCents === null || amountCents === 0
        ? "The amount on this line is not valid."
        : null;
  return { occurredOn, postedOn, description: description.trim(), amountCents, balanceCents, issue };
}

export const cgdMovimentosParser: StatementParser = {
  id: "cgd-movimentos",
  label: "Caixa Geral de Depósitos — Consultar saldos e movimentos",

  detect(text) {
    return text.includes("Caixa Geral de Dep") && text.includes("Consultar saldos e movimentos");
  },

  parse(text): ParsedStatement {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);

    // Newest first in the PDF; reversing also restores same-day posting order.
    const rows = lines
      .filter((line) => STARTS_WITH_DATES.test(line))
      .map(readRow)
      .reverse()
      .map((row, index) => ({ ...row, position: index + 1 }));

    return { parserId: this.id, label: this.label, ...readHeader(lines), rows };
  },
};
