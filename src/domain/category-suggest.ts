export type SuggestCategory = {
  id: number;
  name: string;
};

export type SuggestExpense = {
  occurredOn: string;
  categoryId: number | null;
  note: string | null;
};

export type CategorySuggestion = {
  categoryId: number | null;
  rationale: string;
};

const KEYWORDS: Record<string, readonly string[]> = {
  Transport: ["uber", "lyft", "taxi", "bus", "train", "metro", "fuel", "parking"],
  Dining: ["restaurant", "cafe", "coffee", "lunch", "dinner", "takeaway"],
  Groceries: ["grocery", "groceries", "supermarket"],
  Housing: ["rent", "landlord", "mortgage"],
  Utilities: ["electric", "electricity", "water", "internet", "utility", "utilities"],
  Health: ["doctor", "pharmacy", "hospital", "dentist"],
  Insurance: ["insurance", "premium"],
  Entertainment: ["netflix", "cinema", "movie", "spotify"],
  Shopping: ["amazon", "clothes", "shopping"],
  Education: ["tuition", "course", "school"],
};

function isoDayNumber(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(date.getTime() / 86_400_000);
}

export function wordsInNote(note: string): string[] {
  return note.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function categoryByName(
  categories: readonly SuggestCategory[],
  name: string,
): SuggestCategory | undefined {
  const wanted = name.toLowerCase();
  return categories.find((category) => category.name.toLowerCase() === wanted);
}

function keywordCategory(
  note: string,
  categories: readonly SuggestCategory[],
): SuggestCategory | undefined {
  const words = wordsInNote(note);
  if (words.length === 0) return undefined;

  const fromFirst = matchWord(words[0], categories);
  if (fromFirst) return fromFirst;
  for (const word of words.slice(1)) {
    const match = matchWord(word, categories);
    if (match) return match;
  }
  return undefined;
}

function matchWord(
  word: string,
  categories: readonly SuggestCategory[],
): SuggestCategory | undefined {
  for (const [name, keywords] of Object.entries(KEYWORDS)) {
    if (!keywords.includes(word)) continue;
    const category = categoryByName(categories, name);
    if (category) return category;
  }
  return undefined;
}

function frequentCategory(
  expenses: readonly SuggestExpense[],
  categories: readonly SuggestCategory[],
  asOf: string,
): SuggestCategory | undefined {
  const asOfDay = isoDayNumber(asOf);
  if (asOfDay === null) return undefined;
  const known = new Set(categories.map((category) => category.id));
  const counts = new Map<number, number>();
  for (const expense of expenses) {
    if (expense.categoryId === null || !known.has(expense.categoryId)) continue;
    const day = isoDayNumber(expense.occurredOn);
    if (day === null) continue;
    const age = asOfDay - day;
    if (age < 0 || age > 90) continue;
    counts.set(expense.categoryId, (counts.get(expense.categoryId) ?? 0) + 1);
  }
  let best: SuggestCategory | undefined;
  let bestCount = 0;
  for (const category of categories) {
    const count = counts.get(category.id) ?? 0;
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

/** Keyword on the note, then the most used category in the last 90 days. */
export function suggestCategoryFallback(input: {
  note: string;
  asOf: string;
  categories: readonly SuggestCategory[];
  recentExpenses: readonly SuggestExpense[];
}): CategorySuggestion {
  const keyword = keywordCategory(input.note, input.categories);
  if (keyword) {
    return {
      categoryId: keyword.id,
      rationale: `The note matches ${keyword.name}.`,
    };
  }
  const frequent = frequentCategory(
    input.recentExpenses,
    input.categories,
    input.asOf,
  );
  if (frequent) {
    return {
      categoryId: frequent.id,
      rationale: `${frequent.name} is the category you used most often in the last 90 days.`,
    };
  }
  return {
    categoryId: null,
    rationale: "No keyword or recent category matched this note.",
  };
}

export type RecentLabel = {
  notePrefix: string;
  categoryId: number;
  count: number;
};

export function recentCategoryLabels(
  expenses: readonly SuggestExpense[],
  asOf: string,
): RecentLabel[] {
  const asOfDay = isoDayNumber(asOf);
  if (asOfDay === null) return [];
  const counts = new Map<string, RecentLabel>();
  for (const expense of expenses) {
    if (expense.categoryId === null || !expense.note) continue;
    const day = isoDayNumber(expense.occurredOn);
    if (day === null) continue;
    const age = asOfDay - day;
    if (age < 0 || age > 90) continue;
    const prefix = wordsInNote(expense.note)[0];
    if (!prefix) continue;
    const key = `${prefix}:${expense.categoryId}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else {
      counts.set(key, {
        notePrefix: prefix,
        categoryId: expense.categoryId,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.categoryId - b.categoryId || a.notePrefix.localeCompare(b.notePrefix),
  );
}
