import type { ImportKind } from "./import-normalize";

export const LINK_MODES = ["none", "closing", "per_row"] as const;
export type LinkMode = (typeof LINK_MODES)[number];

export function isLinkMode(value: string): value is LinkMode {
  return (LINK_MODES as readonly string[]).includes(value);
}

export type LinkPlanRow = {
  position: number;
  occurredOn: string;
  kind: ImportKind;
  amountCents: number;
};

export type LinkPlan = {
  /** Per-row mode: positions that will be posted without the cash link. */
  unlinked: Set<number>;
  /** Per-row mode: first position that would make the balance negative. */
  negativeAt: number | null;
  /** Per-row mode: number of balance snapshots the import will add. */
  snapshotsAdded: number;
  closing: "write" | "skip_newer" | "skip_negative" | "unavailable" | "not_applicable";
};

/**
 * Predicts what confirming will do to the chosen cash account, mirroring the
 * cash-link rules: rows dated before the latest balance stay unlinked, and a
 * balance may never go below zero.
 */
export function planCashLinks(input: {
  mode: LinkMode;
  rows: readonly LinkPlanRow[];
  latest: { recordedOn: string; amountCents: number } | null;
  closingBalanceCents: number | null;
  periodTo: string | null;
}): LinkPlan {
  const plan: LinkPlan = {
    unlinked: new Set(),
    negativeAt: null,
    snapshotsAdded: 0,
    closing: "not_applicable",
  };

  if (input.mode === "closing") {
    if (input.closingBalanceCents === null || input.periodTo === null) plan.closing = "unavailable";
    else if (input.closingBalanceCents < 0) plan.closing = "skip_negative";
    else if (input.latest !== null && input.latest.recordedOn >= input.periodTo) plan.closing = "skip_newer";
    else plan.closing = "write";
  }

  if (input.mode === "per_row") {
    const ordered = [...input.rows].sort(
      (a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.position - b.position,
    );
    let balance = input.latest?.amountCents ?? 0;
    let latestDate = input.latest?.recordedOn ?? null;
    for (const row of ordered) {
      if (latestDate !== null && row.occurredOn < latestDate) {
        plan.unlinked.add(row.position);
        continue;
      }
      balance += row.kind === "income" ? row.amountCents : -row.amountCents;
      latestDate = row.occurredOn;
      plan.snapshotsAdded += 1;
      if (balance < 0 && plan.negativeAt === null) plan.negativeAt = row.position;
    }
  }

  return plan;
}
