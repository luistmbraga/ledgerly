import { suggestCategoryFallback, type SuggestCategory } from "./category-suggest";

export type ImportKind = "expense" | "income";

export type ImportCandidate = {
  /** 1-based chronological position in the statement. */
  position: number;
  occurredOn: string | null;
  kind: ImportKind;
  /** Always positive; the sign became `kind`. */
  amountCents: number | null;
  description: string;
  normalizedDescription: string;
  /** Null when the row has an issue and cannot be imported. */
  fingerprint: string | null;
  issue: string | null;
};

export type NormalizableRow = {
  position: number;
  occurredOn: string | null;
  description: string;
  amountCents: number | null;
  issue: string | null;
};

// Bank movement-type prefixes, longest first. Card digits after them are dropped.
const PREFIX = new RegExp(
  "^(?:" +
    [
      String.raw`compras c\.deb`,
      String.raw`compra(?: \d{4})?`,
      String.raw`cred\.(?: \d{4})?`,
      String.raw`lev atm(?: \d{4})?`,
      String.raw`trf mb ?way(?: p/)?`,
      String.raw`trf\. p/o`,
      String.raw`trf p/`,
      "trf",
      "tfi",
    ].join("|") +
    String.raw`)\s+`,
);

/** Lower-cased, accent-free, without the bank's movement-type prefix, single-spaced. */
export function normalizeDescription(description: string): string {
  const text = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return text.replace(PREFIX, "").trim();
}

/**
 * Signed statement rows → positive-amount candidates with fingerprints.
 * The fingerprint's last part counts identical rows on the same day, so two real
 * identical purchases stay distinct while a re-imported statement matches exactly.
 */
export function toCandidates(rows: readonly NormalizableRow[]): ImportCandidate[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const kind: ImportKind = row.amountCents !== null && row.amountCents > 0 ? "income" : "expense";
    const amountCents = row.amountCents === null ? null : Math.abs(row.amountCents);
    const normalizedDescription = normalizeDescription(row.description);
    const note = row.description.trim().slice(0, 500);
    let issue = row.issue;
    if (issue === null && note.length === 0) issue = "This row has no description.";

    let fingerprint: string | null = null;
    if (issue === null && row.occurredOn !== null && amountCents !== null) {
      const key = `${row.occurredOn}|${amountCents}|${kind}|${normalizedDescription}`;
      const occurrence = (seen.get(key) ?? 0) + 1;
      seen.set(key, occurrence);
      fingerprint = `${key}|${occurrence}`;
    }

    return {
      position: row.position,
      occurredOn: row.occurredOn,
      kind,
      amountCents,
      description: note,
      normalizedDescription,
      fingerprint,
      issue,
    };
  });
}

export type CategoryHistoryRow = {
  kind: ImportKind;
  occurredOn: string;
  categoryId: number | null;
  note: string | null;
};

export type ImportCategorySuggester = (candidate: Pick<ImportCandidate, "kind" | "description" | "normalizedDescription">) => number | null;

/**
 * Category for an imported row: the latest categorized journal row with the same
 * normalized description, else a keyword match, else none. Never "most used".
 */
export function buildCategorySuggester(input: {
  history: readonly CategoryHistoryRow[];
  categories: Readonly<Record<ImportKind, readonly SuggestCategory[]>>;
  asOf: string;
}): ImportCategorySuggester {
  const latest = new Map<string, { occurredOn: string; categoryId: number }>();
  for (const row of input.history) {
    if (row.categoryId === null || row.note === null) continue;
    const key = `${row.kind}|${normalizeDescription(row.note)}`;
    const current = latest.get(key);
    if (!current || row.occurredOn >= current.occurredOn) {
      latest.set(key, { occurredOn: row.occurredOn, categoryId: row.categoryId });
    }
  }

  return (candidate) => {
    const remembered = latest.get(`${candidate.kind}|${candidate.normalizedDescription}`);
    if (remembered) return remembered.categoryId;
    return suggestCategoryFallback({
      note: candidate.description,
      asOf: input.asOf,
      categories: input.categories[candidate.kind],
      recentExpenses: [],
    }).categoryId;
  };
}
