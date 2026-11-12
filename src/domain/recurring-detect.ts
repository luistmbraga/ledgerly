import { addMonths, isoDateToDayNumber } from "@/lib/dates";
import { normalizeDescription, type ImportKind } from "./import-normalize";

export type DetectionRow = {
  kind: ImportKind;
  occurredOn: string;
  amountCents: number;
  note: string | null;
  categoryId: number | null;
};

export type DetectionTemplate = {
  kind: ImportKind;
  matchText: string | null;
  note: string | null;
};

export type RecurringSuggestion = {
  /** Stable while the underlying history is unchanged: `kind|matchText|cluster`. */
  key: string;
  kind: ImportKind;
  note: string;
  matchText: string;
  amountCents: number;
  amountVaries: boolean;
  categoryId: number | null;
  anchorOn: string;
  occurrences: Array<{ occurredOn: string; amountCents: number }>;
};

export const MIN_OCCURRENCES = 3;
export const MONTHLY_GAP_DAYS = { min: 24, max: 38 } as const;
export const ACTIVE_WITHIN_DAYS = 45;
export const LOOKBACK_MONTHS = 6;
const VARIES_RATIO = 0.01;

function day(iso: string): number {
  return isoDateToDayNumber(iso)!;
}

/** Splits a group that has `k` payments in some month at the `k - 1` largest amount gaps. */
function splitByAmount(rows: DetectionRow[]): DetectionRow[][] {
  const perMonth = new Map<string, number>();
  for (const row of rows) perMonth.set(row.occurredOn.slice(0, 7), (perMonth.get(row.occurredOn.slice(0, 7)) ?? 0) + 1);
  const k = Math.max(...perMonth.values());
  if (k <= 1) return [rows];

  const sorted = [...rows].sort((a, b) => a.amountCents - b.amountCents);
  const cuts = sorted
    .slice(1)
    .map((row, i) => ({ at: i + 1, gap: row.amountCents - sorted[i].amountCents }))
    .sort((a, b) => b.gap - a.gap || a.at - b.at)
    .slice(0, k - 1)
    .map((cut) => cut.at)
    .sort((a, b) => a - b);

  const clusters: DetectionRow[][] = [];
  let start = 0;
  for (const cut of [...cuts, sorted.length]) {
    clusters.push(sorted.slice(start, cut));
    start = cut;
  }
  return clusters;
}

function isMonthly(byDate: DetectionRow[]): boolean {
  if (byDate.length < MIN_OCCURRENCES) return false;
  for (let i = 1; i < byDate.length; i += 1) {
    const gap = day(byDate[i].occurredOn) - day(byDate[i - 1].occurredOn);
    if (gap < MONTHLY_GAP_DAYS.min || gap > MONTHLY_GAP_DAYS.max) return false;
  }
  return true;
}

function mostCommonCategory(byDate: DetectionRow[]): number | null {
  const counts = new Map<number, { count: number; latest: string }>();
  for (const row of byDate) {
    if (row.categoryId === null) continue;
    const current = counts.get(row.categoryId);
    counts.set(row.categoryId, { count: (current?.count ?? 0) + 1, latest: row.occurredOn });
  }
  let best: number | null = null;
  let bestScore = { count: 0, latest: "" };
  for (const [id, score] of counts) {
    if (score.count > bestScore.count || (score.count === bestScore.count && score.latest > bestScore.latest)) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}


function isCovered(kind: ImportKind, matchText: string, templates: readonly DetectionTemplate[]): boolean {
  return templates.some((template) => {
    if (template.kind !== kind) return false;
    const text = template.matchText ? normalizeDescription(template.matchText) : "";
    if (text !== "" && matchText.includes(text)) return true;
    return template.note !== null && normalizeDescription(template.note) === matchText;
  });
}

/**
 * Monthly patterns in journal rows that no template covers yet. Rows posted by a
 * template must be excluded by the caller. Each suggestion starts at the next
 * expected date so months already in the journal are never posted again.
 */
export function detectRecurring(input: {
  rows: readonly DetectionRow[];
  templates: readonly DetectionTemplate[];
  asOf: string;
}): RecurringSuggestion[] {
  const from = addMonths(input.asOf, -LOOKBACK_MONTHS);
  const groups = new Map<string, DetectionRow[]>();
  for (const row of input.rows) {
    if (row.note === null || row.occurredOn < from || row.occurredOn > input.asOf) continue;
    const text = normalizeDescription(row.note);
    if (text === "") continue;
    const key = `${row.kind}|${text}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const suggestions: RecurringSuggestion[] = [];
  for (const [groupKey, rows] of groups) {
    const separator = groupKey.indexOf("|");
    const kind = groupKey.slice(0, separator) as ImportKind;
    const matchText = groupKey.slice(separator + 1);
    if (isCovered(kind, matchText, input.templates)) continue;

    splitByAmount(rows).forEach((cluster, index) => {
      const byDate = [...cluster].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
      if (!isMonthly(byDate)) return;
      const last = byDate[byDate.length - 1];
      if (day(input.asOf) - day(last.occurredOn) > ACTIVE_WITHIN_DAYS) return;

      const amounts = byDate.map((row) => row.amountCents);
      const max = Math.max(...amounts);
      suggestions.push({
        key: `${groupKey}|${index}`,
        kind,
        note: last.note!,
        matchText,
        amountCents: last.amountCents,
        amountVaries: max - Math.min(...amounts) > VARIES_RATIO * max,
        categoryId: mostCommonCategory(byDate),
        // One month after the last occurrence: a median day breaks for payments
        // that straddle the month end (Aug 31, Sep 29, Nov 1).
        anchorOn: addMonths(last.occurredOn, 1),
        occurrences: byDate.map((row) => ({ occurredOn: row.occurredOn, amountCents: row.amountCents })),
      });
    });
  }

  return suggestions.sort((a, b) => a.anchorOn.localeCompare(b.anchorOn) || a.key.localeCompare(b.key));
}
