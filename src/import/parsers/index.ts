import type { StatementParser } from "../types";
import { activobankExtratoParser } from "./activobank";
import { cgdMovimentosParser } from "./cgd";
import { tradeRepublicExtratoParser } from "./trade-republic";

export const STATEMENT_PARSERS: readonly StatementParser[] = [
  cgdMovimentosParser,
  activobankExtratoParser,
  tradeRepublicExtratoParser,
];

export function findParser(text: string): StatementParser | null {
  return STATEMENT_PARSERS.find((parser) => parser.detect(text)) ?? null;
}
