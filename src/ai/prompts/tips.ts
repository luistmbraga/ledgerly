export const TIPS_VERSION = "tips_v1";

export const TIPS_INSTRUCTIONS = `Task tips.
Write at most one tip per finding id in snapshot.findings. Skip ids that are not in the input.
Do not add findings. Do not invent amounts; every number must already appear in the JSON.
title at most 80 characters, body at most 400 characters, at most 6 tips.
If you cannot answer within these rules, set refused to true and give a short reason, and still include tips.`;
