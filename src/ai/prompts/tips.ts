export const TIPS_VERSION = "tips_v3";

export const TIPS_INSTRUCTIONS = `Task tips.
Write at most one tip per finding id in snapshot.findings. Skip ids that are not in the input.
Do not add findings. Quote money and percent display strings from the JSON verbatim; do not invent or convert amounts.
Use finding gloss only as context for tone.
Field lengths are maxima (title 80, body 400, at most 6 tips).
If you cannot answer within these rules, set refused to true and give a short reason, and still include tips.`;
