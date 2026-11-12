import type { ImportFlag } from "./import-dedupe";
import type { ImportCandidate, ImportKind } from "./import-normalize";

/** A bank row that confirms an entry a recurring template already posted. */
export type RecurringReconcile = {
  position: number;
  kind: ImportKind;
  entryId: number;
  previousAmountCents: number;
  previousOccurredOn: string;
  amountCents: number;
  occurredOn: string;
  fingerprint: string;
  /** The bank's amount or date differs from the posted entry. */
  differs: boolean;
};

export type ResolvedReconcile = RecurringReconcile & { update: boolean };

export function buildRecurringReconciles(
  candidates: readonly ImportCandidate[],
  flags: ReadonlyMap<number, ImportFlag>,
): RecurringReconcile[] {
  return candidates.flatMap((candidate) => {
    const flag = flags.get(candidate.position);
    if (
      flag?.type !== "likely_recurring" ||
      candidate.occurredOn === null ||
      candidate.amountCents === null ||
      candidate.fingerprint === null
    ) {
      return [];
    }
    return [
      {
        position: candidate.position,
        kind: candidate.kind,
        entryId: flag.matchId,
        previousAmountCents: flag.matchAmountCents,
        previousOccurredOn: flag.matchOccurredOn,
        amountCents: candidate.amountCents,
        occurredOn: candidate.occurredOn,
        fingerprint: candidate.fingerprint,
        differs: flag.matchAmountCents !== candidate.amountCents || flag.matchOccurredOn !== candidate.occurredOn,
      },
    ];
  });
}

/**
 * Applies the positions the user ticked for "update the posted entry". Every
 * matched entry still gets the bank fingerprint; only ticked rows that differ
 * change amount and date. A position the server no longer flags is rejected.
 */
export function resolveRecurringUpdates(
  reconciles: readonly RecurringReconcile[],
  requestedPositions: readonly number[],
): { ok: true; items: ResolvedReconcile[] } | { ok: false; error: string } {
  const byPosition = new Map(reconciles.map((r) => [r.position, r]));
  for (const position of requestedPositions) {
    if (!byPosition.has(position)) {
      return { ok: false, error: "This preview is out of date. Preview the file again." };
    }
  }
  const requested = new Set(requestedPositions);
  return {
    ok: true,
    items: reconciles.map((r) => ({ ...r, update: r.differs && requested.has(r.position) })),
  };
}
