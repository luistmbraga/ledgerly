import { isoDateToDayNumber } from "@/lib/dates";
import { normalizeDescription, type ImportCandidate, type ImportKind } from "./import-normalize";
import { periodKey, type Cadence } from "./recurring";

export type ImportFlag =
  | { type: "exact"; reason: string; matchId: number }
  | {
      type: "likely_recurring";
      reason: string;
      matchId: number;
      matchAmountCents: number;
      matchOccurredOn: string;
    }
  | { type: "likely_manual"; reason: string; matchId: number }
  | { type: "own_transfer"; reason: string }
  | { type: "investment_trade"; reason: string }
  | { type: "offsetting_pair"; reason: string; pairPosition: number };

export type ExistingJournalRow = {
  id: number;
  kind: ImportKind;
  amountCents: number;
  occurredOn: string;
  note: string | null;
  importFingerprint: string | null;
  recurringTemplateId: number | null;
  recurringPeriod: string | null;
};

export type TemplateMatcher = {
  id: number;
  kind: ImportKind;
  cadence: Cadence;
  matchText: string | null;
};

export const LIKELY_MANUAL_DAYS = 3;
/** A template-posted entry this close to a bank row matches even across a period boundary. */
export const RECURRING_NEARBY_DAYS = 5;
export const RECURRING_AMOUNT_TOLERANCE = 0.2;
const MIN_HOLDER_PREFIX = 6;

function dayDistance(a: string, b: string): number {
  return Math.abs(isoDateToDayNumber(a)! - isoDateToDayNumber(b)!);
}

function rowLabel(row: ExistingJournalRow): string {
  return `${row.occurredOn}${row.note ? ` "${row.note}"` : ""}`;
}

/** True when a description is the (possibly truncated) account holder's name. */
export function isOwnTransfer(normalizedDescription: string, holderName: string | null): boolean {
  if (holderName === null) return false;
  const holder = normalizeDescription(holderName);
  const description = normalizedDescription.replace(/\s+$/, "");
  if (description.length < MIN_HOLDER_PREFIX || holder.length < MIN_HOLDER_PREFIX) return false;
  return holder.startsWith(description) || description.startsWith(holder);
}

const INVESTMENT_TRADE = /^(?:buy trade|sell trade|savings plan execution)\b/;

/** True for broker trade rows (e.g. Trade Republic's "Buy trade …"). */
export function isInvestmentTrade(normalizedDescription: string): boolean {
  return INVESTMENT_TRADE.test(normalizedDescription);
}

/**
 * One flag per candidate (or none), in priority order: exact duplicate, posted by a
 * recurring template, matching a hand-entered row, own-account transfer, investment
 * trade, then a same-day pair that cancels out. Each existing row matches at most one candidate.
 */
export function flagCandidates(input: {
  candidates: readonly ImportCandidate[];
  existing: readonly ExistingJournalRow[];
  templates: readonly TemplateMatcher[];
  holderName: string | null;
}): Map<number, ImportFlag> {
  const flags = new Map<number, ImportFlag>();
  const used = new Set<number>();
  const usable = input.candidates.filter(
    (c) => c.issue === null && c.fingerprint !== null && c.occurredOn !== null && c.amountCents !== null,
  ) as Array<ImportCandidate & { fingerprint: string; occurredOn: string; amountCents: number }>;

  const key = (row: ExistingJournalRow) => row.id * 2 + (row.kind === "income" ? 1 : 0);
  const byFingerprint = new Map<string, ExistingJournalRow>();
  for (const row of input.existing) {
    if (row.importFingerprint !== null) byFingerprint.set(`${row.kind}:${row.importFingerprint}`, row);
  }
  for (const candidate of usable) {
    const match = byFingerprint.get(`${candidate.kind}:${candidate.fingerprint}`);
    if (match) {
      used.add(key(match));
      flags.set(candidate.position, {
        type: "exact",
        reason: `Already imported (${rowLabel(match)}).`,
        matchId: match.id,
      });
    }
  }

  const templates = new Map(input.templates.map((t) => [t.id, t]));

  for (const candidate of usable) {
    if (flags.has(candidate.position)) continue;
    const eligible = input.existing.filter((row) => {
      if (used.has(key(row)) || row.kind !== candidate.kind || row.recurringTemplateId === null) return false;
      const template = templates.get(row.recurringTemplateId);
      if (!template) return false;
      const samePeriod = row.recurringPeriod === periodKey(candidate.occurredOn, template.cadence);
      if (!samePeriod && dayDistance(row.occurredOn, candidate.occurredOn) > RECURRING_NEARBY_DAYS) return false;
      if (template.matchText) {
        return candidate.normalizedDescription.includes(normalizeDescription(template.matchText));
      }
      return (
        Math.abs(row.amountCents - candidate.amountCents) <=
        RECURRING_AMOUNT_TOLERANCE * row.amountCents
      );
    });
    const match = eligible.sort(
      (a, b) =>
        dayDistance(a.occurredOn, candidate.occurredOn) - dayDistance(b.occurredOn, candidate.occurredOn) ||
        a.id - b.id,
    )[0];
    if (match) {
      used.add(key(match));
      flags.set(candidate.position, {
        type: "likely_recurring",
        reason: `Probably already posted by a recurring entry (${rowLabel(match)}).`,
        matchId: match.id,
        matchAmountCents: match.amountCents,
        matchOccurredOn: match.occurredOn,
      });
    }
  }

  for (const candidate of usable) {
    if (flags.has(candidate.position)) continue;
    const match = input.existing.find(
      (row) =>
        !used.has(key(row)) &&
        row.importFingerprint === null &&
        row.recurringTemplateId === null &&
        row.kind === candidate.kind &&
        row.amountCents === candidate.amountCents &&
        dayDistance(row.occurredOn, candidate.occurredOn) <= LIKELY_MANUAL_DAYS,
    );
    if (match) {
      used.add(key(match));
      flags.set(candidate.position, {
        type: "likely_manual",
        reason: `Matches an entry you added (${rowLabel(match)}).`,
        matchId: match.id,
      });
    }
  }

  for (const candidate of usable) {
    if (flags.has(candidate.position)) continue;
    if (isOwnTransfer(candidate.normalizedDescription, input.holderName)) {
      flags.set(candidate.position, {
        type: "own_transfer",
        reason: "Looks like a transfer to or from your own account.",
      });
    }
  }

  for (const candidate of usable) {
    if (flags.has(candidate.position)) continue;
    if (isInvestmentTrade(candidate.normalizedDescription)) {
      flags.set(candidate.position, {
        type: "investment_trade",
        reason: "Buying or selling an investment moves money into or out of a holding; it isn't spending or income.",
      });
    }
  }

  for (const candidate of usable) {
    if (flags.has(candidate.position)) continue;
    const opposite = usable.filter(
      (other) =>
        other.position !== candidate.position &&
        !flags.has(other.position) &&
        other.occurredOn === candidate.occurredOn &&
        other.amountCents === candidate.amountCents &&
        other.kind !== candidate.kind,
    );
    const pair =
      opposite.find((other) => other.normalizedDescription === candidate.normalizedDescription) ??
      opposite[0];
    if (pair) {
      const reason = "Same-day movements that cancel each other out.";
      flags.set(candidate.position, { type: "offsetting_pair", reason, pairPosition: pair.position });
      flags.set(pair.position, { type: "offsetting_pair", reason, pairPosition: candidate.position });
    }
  }

  return flags;
}
