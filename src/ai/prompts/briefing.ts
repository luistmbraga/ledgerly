export const BRIEFING_VERSION = "briefing_v1";

export const BRIEFING_INSTRUCTIONS = `Task briefing.
Narrate the decision object. Do not change percentages, gaps, or the profile.
Do not name ticker symbols, funds, or products. Do not say guaranteed or will return. Do not give tax instructions.
headline at most 120 characters. At most 5 sections. heading at most 60 characters, body at most 600 characters.
disclaimer at most 300 characters.
If you cannot answer within these rules, set refused to true and give a short reason, and still include headline, sections, and disclaimer.`;

export const BRIEFING_DISCLAIMER =
  "This is educational information based on your self-assessment and the data you entered. It is not investment advice or a recommendation to buy or sell any product.";
