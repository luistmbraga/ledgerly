/**
 * Investor personality scoring.
 *
 * Contributions are the option points in docs/domain.md. Each dimension
 * score sums the contributions named in the composite block, then scales
 * that sum to 0–100:
 *
 *   round(100 * (raw - minRaw) / (maxRaw - minRaw))
 *
 * Min and max are the fixed extremes of those contributions. Scaling the
 * sum matches scaling the mean, so risk and liquidity use the questions
 * the composite block lists. Stored scores are the 0–100 values. An
 * unscaled mean of the liquidity points tops out at 53 and could never
 * meet the capital_preserver cutoff of 70.
 */

export const PERSONALITY_QUESTION_KEYS = [
  "risk_comfort",
  "time_horizon",
  "experience",
  "loss_reaction",
  "liquidity_need",
] as const;

export type PersonalityQuestionKey = (typeof PERSONALITY_QUESTION_KEYS)[number];

export type PersonalityAnswers = Record<PersonalityQuestionKey, string>;

export type PersonalityLabel =
  | "capital_preserver"
  | "conservative"
  | "balanced"
  | "growth"
  | "aggressive";

export type PersonalityDimensionScores = {
  riskScore: number;
  horizonScore: number;
  experienceScore: number;
  liquidityScore: number;
};

export type PersonalityScore = PersonalityDimensionScores & {
  label: PersonalityLabel;
};

export const PERSONALITY_TITLES: Record<PersonalityLabel, string> = {
  capital_preserver: "Capital Preserver",
  conservative: "Conservative",
  balanced: "Balanced",
  growth: "Growth-Oriented",
  aggressive: "Aggressive",
};

type Contribution = {
  risk?: number;
  horizon?: number;
  experience?: number;
  liquidity?: number;
};

const OPTIONS: Record<string, Contribution> = {
  rc_1: { risk: 10, liquidity: 30 },
  rc_2: { risk: 30, liquidity: 25 },
  rc_3: { risk: 55, liquidity: 15 },
  rc_4: { risk: 75, liquidity: 10 },
  rc_5: { risk: 90, liquidity: 5 },
  th_1: { horizon: 15 },
  th_2: { horizon: 35 },
  th_3: { horizon: 55 },
  th_4: { horizon: 75 },
  th_5: { horizon: 90 },
  ex_1: { experience: 10 },
  ex_2: { experience: 30 },
  ex_3: { experience: 55 },
  ex_4: { experience: 75 },
  ex_5: { experience: 90 },
  lr_1: { risk: 5, liquidity: 40 },
  lr_2: { risk: 20, liquidity: 30 },
  lr_3: { risk: 45, liquidity: 20 },
  lr_4: { risk: 65, liquidity: 15 },
  lr_5: { risk: 85, liquidity: 10 },
  ln_1: { liquidity: 90 },
  ln_2: { liquidity: 70 },
  ln_3: { liquidity: 45 },
  ln_4: { liquidity: 25 },
  ln_5: { liquidity: 10 },
};

const QUESTION_OPTIONS: Record<PersonalityQuestionKey, readonly string[]> = {
  risk_comfort: ["rc_1", "rc_2", "rc_3", "rc_4", "rc_5"],
  time_horizon: ["th_1", "th_2", "th_3", "th_4", "th_5"],
  experience: ["ex_1", "ex_2", "ex_3", "ex_4", "ex_5"],
  loss_reaction: ["lr_1", "lr_2", "lr_3", "lr_4", "lr_5"],
  liquidity_need: ["ln_1", "ln_2", "ln_3", "ln_4", "ln_5"],
};

/** Fixed extremes of the summed contributions for each dimension. */
const SCALE = {
  risk: { min: 10 + 5, max: 90 + 85 },
  horizon: { min: 15, max: 90 },
  experience: { min: 10, max: 90 },
  liquidity: { min: 5 + 10 + 10, max: 30 + 40 + 90 },
} as const;

export type PersonalityQuestion = {
  key: PersonalityQuestionKey;
  prompt: string;
  options: readonly { id: string; label: string }[];
};

export const PERSONALITY_QUESTIONS: readonly PersonalityQuestion[] = [
  {
    key: "risk_comfort",
    prompt: "How do you feel about investment risk?",
    options: [
      { id: "rc_1", label: "I want to protect what I have, even if it grows slowly" },
      { id: "rc_2", label: "I will accept small dips for a bit more growth" },
      { id: "rc_3", label: "I can live with moderate ups and downs" },
      { id: "rc_4", label: "I am comfortable with large swings for higher growth" },
      { id: "rc_5", label: "I will accept sharp drops for a higher long-term upside" },
    ],
  },
  {
    key: "time_horizon",
    prompt: "How long are you investing for your long-term goals?",
    options: [
      { id: "th_1", label: "Less than 3 years" },
      { id: "th_2", label: "About 3 to 7 years" },
      { id: "th_3", label: "About 7 to 15 years" },
      { id: "th_4", label: "About 15 to 25 years" },
      { id: "th_5", label: "More than 25 years" },
    ],
  },
  {
    key: "experience",
    prompt: "How much investing experience do you have?",
    options: [
      { id: "ex_1", label: "I am new to investing" },
      { id: "ex_2", label: "I have a little experience" },
      { id: "ex_3", label: "I have invested through some ups and downs" },
      { id: "ex_4", label: "I am experienced" },
      { id: "ex_5", label: "I am very experienced" },
    ],
  },
  {
    key: "loss_reaction",
    prompt: "If your portfolio fell 20% in a month, what would you do?",
    options: [
      { id: "lr_1", label: "Sell to stop further losses" },
      { id: "lr_2", label: "Sell some of it" },
      { id: "lr_3", label: "Hold and wait" },
      { id: "lr_4", label: "Hold, and maybe add a little" },
      { id: "lr_5", label: "Invest more" },
    ],
  },
  {
    key: "liquidity_need",
    prompt: "How much of this money might you need in cash within 12 months?",
    options: [
      { id: "ln_1", label: "Most of it" },
      { id: "ln_2", label: "A large share" },
      { id: "ln_3", label: "Some of it" },
      { id: "ln_4", label: "Probably none" },
      { id: "ln_5", label: "None — I can leave it invested" },
    ],
  },
];

function scale(raw: number, minRaw: number, maxRaw: number): number {
  return Math.round((100 * (raw - minRaw)) / (maxRaw - minRaw));
}

function optionFor(key: PersonalityQuestionKey, optionId: string): Contribution {
  const allowed = QUESTION_OPTIONS[key];
  if (!allowed.includes(optionId)) {
    throw new Error(`Unknown option for ${key}.`);
  }
  const contribution = OPTIONS[optionId];
  if (!contribution) {
    throw new Error(`Unknown option for ${key}.`);
  }
  return contribution;
}

/** Label rules, evaluated in the documented order. */
export function personalityLabel(scores: PersonalityDimensionScores): PersonalityLabel {
  if (scores.liquidityScore >= 70) return "capital_preserver";
  if (scores.riskScore <= 35) return "conservative";
  if (scores.riskScore <= 55 && scores.horizonScore >= 50) return "balanced";
  if (scores.riskScore <= 75 && scores.experienceScore >= 40) return "growth";
  if (scores.riskScore > 75 && scores.experienceScore >= 55) return "aggressive";
  return "balanced";
}

export function scorePersonality(answers: PersonalityAnswers): PersonalityScore {
  for (const key of PERSONALITY_QUESTION_KEYS) {
    if (typeof answers[key] !== "string" || answers[key].length === 0) {
      throw new Error("Answer all five questions.");
    }
  }

  const riskComfort = optionFor("risk_comfort", answers.risk_comfort);
  const timeHorizon = optionFor("time_horizon", answers.time_horizon);
  const experience = optionFor("experience", answers.experience);
  const lossReaction = optionFor("loss_reaction", answers.loss_reaction);
  const liquidityNeed = optionFor("liquidity_need", answers.liquidity_need);

  const scores: PersonalityDimensionScores = {
    riskScore: scale(
      (riskComfort.risk ?? 0) + (lossReaction.risk ?? 0),
      SCALE.risk.min,
      SCALE.risk.max,
    ),
    horizonScore: scale(timeHorizon.horizon ?? 0, SCALE.horizon.min, SCALE.horizon.max),
    experienceScore: scale(
      experience.experience ?? 0,
      SCALE.experience.min,
      SCALE.experience.max,
    ),
    liquidityScore: scale(
      (riskComfort.liquidity ?? 0) +
        (lossReaction.liquidity ?? 0) +
        (liquidityNeed.liquidity ?? 0),
      SCALE.liquidity.min,
      SCALE.liquidity.max,
    ),
  };

  return { ...scores, label: personalityLabel(scores) };
}
