export const BRIEFING_VERSION = "briefing_v3";

export const BRIEFING_INSTRUCTIONS = `Task briefing.
Narrate the decision object. Do not change percentages, gaps, or the profile.
Quote money, percent, and drift strings from the JSON verbatim. Use priority gloss only as context.
If interest is present, you may describe it in one short section, quoting its strings verbatim. Do not compare it with investment returns or suggest where to move money.
Do not name ticker symbols, funds, or products. Do not say guaranteed or will return. Do not give tax instructions.
Field lengths are maxima (headline 120, at most 5 sections with heading 60 and body 600, disclaimer 300).
If you cannot answer within these rules, set refused to true and give a short reason, and still include headline, sections, and disclaimer.`;

export const BRIEFING_DISCLAIMER =
  "This is educational information based on your self-assessment and the data you entered. It is not investment advice or a recommendation to buy or sell any product.";
