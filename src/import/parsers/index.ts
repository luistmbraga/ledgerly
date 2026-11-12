import type { StatementParser } from "../types";
import { cgdMovimentosParser } from "./cgd";

export const STATEMENT_PARSERS: readonly StatementParser[] = [cgdMovimentosParser];

export function findParser(text: string): StatementParser | null {
  return STATEMENT_PARSERS.find((parser) => parser.detect(text)) ?? null;
}
