export const ENTRY_PARSE_VERSION = "entry_parse_v1";

export const ENTRY_PARSE_INSTRUCTIONS = `Task entry_parse.
Parse a natural-language journal entry into structured fields.

Rules:
- kind: "expense" if the person spent money, "income" if they received money.
- amountRaw: the numeric amount as a plain decimal string (e.g. "42" or "42.50"). No currency symbols. No invented amounts.
- occurredOn: resolve date expressions ("yesterday", "last Friday", "today") relative to asOfDate. Output ISO 8601 format (YYYY-MM-DD). If no date is mentioned, use asOfDate.
- categoryId: pick from the categories array by name, or null if none fits or the category is ambiguous.
- note: a short description of the item (5 words or fewer). Use only words from the input.

If the input contains no recognisable amount, set refused to true with a short reason.
Never invent amounts. Quote amountRaw only from the input text.
Field lengths are maxima.`;
