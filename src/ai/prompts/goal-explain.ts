export const GOAL_EXPLAIN_VERSION = "goal_explain_v2";

export const GOAL_EXPLAIN_INSTRUCTIONS = `Task goal_explain.
Explain the goal using the display amounts and rates already in the JSON. Do not change status or invent new figures.
Quote money and percent strings verbatim. Use status and bucket gloss only as context.
Field lengths are maxima (summary 500, at most 5 steps of 200 characters each).
If you cannot answer within these rules, set refused to true and give a short reason, and still include summary and steps.`;
