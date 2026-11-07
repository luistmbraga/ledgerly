export const CATEGORY_SUGGEST_VERSION = "category_suggest_v2";

export const CATEGORY_SUGGEST_INSTRUCTIONS = `Task category_suggest.
Choose categoryId from the categories array, or null if none fits.
Use the expense note and recentLabels. Do not invent a category.
confidence is low, medium, or high.
Quote any figures from the input display strings verbatim; do not invent amounts.
Field lengths are maxima (rationale 200 characters).
If you cannot answer within these rules, set refused to true and give a short reason, and still include categoryId, confidence, and rationale.`;
