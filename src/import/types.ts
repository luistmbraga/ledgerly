/** One movement as read from a statement, in chronological order. */
export type StatementRow = {
  /** 1-based position in chronological order, used in messages. */
  position: number;
  /** When the money moved for the user (value date). Null when unreadable. */
  occurredOn: string | null;
  /** When the bank posted it; used only for ordering. */
  postedOn: string | null;
  description: string;
  /** Signed: negative is money out. Null when unreadable. */
  amountCents: number | null;
  /** Running balance after this movement, when the statement prints one. */
  balanceCents: number | null;
  /** Why this row could not be read; such rows block confirm. */
  issue: string | null;
};

export type ParsedStatement = {
  parserId: string;
  label: string;
  currency: string;
  periodFrom: string | null;
  periodTo: string | null;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  /** Things the preview should tell the user about how the statement was read. */
  notes: string[];
  /** Account holder as printed; used in memory to flag own-account transfers, never stored. */
  holderName: string | null;
  rows: StatementRow[];
};

export type StatementParser = {
  id: string;
  label: string;
  detect(text: string): boolean;
  parse(text: string): ParsedStatement;
};
