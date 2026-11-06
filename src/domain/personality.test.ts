import { describe, expect, it } from "vitest";
import {
  PERSONALITY_QUESTIONS,
  personalityLabel,
  scorePersonality,
  type PersonalityAnswers,
  type PersonalityDimensionScores,
} from "./personality";

function answers(overrides: Partial<PersonalityAnswers> = {}): PersonalityAnswers {
  return {
    risk_comfort: "rc_3",
    time_horizon: "th_3",
    experience: "ex_3",
    loss_reaction: "lr_3",
    liquidity_need: "ln_3",
    ...overrides,
  };
}

function scores(
  overrides: Partial<PersonalityDimensionScores> = {},
): PersonalityDimensionScores {
  return {
    riskScore: 50,
    horizonScore: 50,
    experienceScore: 50,
    liquidityScore: 50,
    ...overrides,
  };
}

describe("scorePersonality", () => {
  it("requires all five questions", () => {
    expect(PERSONALITY_QUESTIONS).toHaveLength(5);
    const incomplete = answers();
    // @ts-expect-error exercise a missing answer at runtime
    delete incomplete.liquidity_need;
    expect(() => scorePersonality(incomplete)).toThrow(/all five/i);
    expect(() =>
      scorePersonality(answers({ risk_comfort: "rc_9" })),
    ).toThrow(/unknown option/i);
  });

  it("scales the lowest contributions to 0 and the highest to 100", () => {
    const low = scorePersonality(
      answers({
        risk_comfort: "rc_1",
        time_horizon: "th_1",
        experience: "ex_1",
        loss_reaction: "lr_1",
        liquidity_need: "ln_5",
      }),
    );
    expect(low.riskScore).toBe(0);
    expect(low.horizonScore).toBe(0);
    expect(low.experienceScore).toBe(0);
    // Liquidity floor is Q1 30 + Q4 40 + Q5 10, not the absolute minimum.
    expect(low.liquidityScore).toBe(41);

    const high = scorePersonality(
      answers({
        risk_comfort: "rc_5",
        time_horizon: "th_5",
        experience: "ex_5",
        loss_reaction: "lr_5",
        liquidity_need: "ln_1",
      }),
    );
    expect(high.riskScore).toBe(100);
    expect(high.horizonScore).toBe(100);
    expect(high.experienceScore).toBe(100);
    // Q1 liquidity falls as risk rises, so this is not the liquidity ceiling.
    expect(high.liquidityScore).toBe(59);
  });

  it("maps high liquidity to capital preserver ahead of risk", () => {
    const result = scorePersonality(
      answers({
        risk_comfort: "rc_5",
        time_horizon: "th_5",
        experience: "ex_5",
        loss_reaction: "lr_2",
        liquidity_need: "ln_1",
      }),
    );
    // Liquidity 5 + 30 + 90 → 74. Risk mean scales to 59.
    expect(result.liquidityScore).toBe(74);
    expect(result.riskScore).toBe(59);
    expect(result.label).toBe("capital_preserver");
  });

  it("stays off capital preserver when liquidity scales to 67", () => {
    const result = scorePersonality(
      answers({
        risk_comfort: "rc_5",
        time_horizon: "th_5",
        experience: "ex_5",
        loss_reaction: "lr_3",
        liquidity_need: "ln_1",
      }),
    );
    expect(result.liquidityScore).toBe(67);
    expect(result.riskScore).toBe(75);
    expect(result.label).toBe("growth");
  });
});

describe("personalityLabel boundaries", () => {
  it("uses capital preserver at liquidity 70 even when risk is high", () => {
    expect(personalityLabel(scores({ liquidityScore: 70, riskScore: 100 }))).toBe(
      "capital_preserver",
    );
    expect(personalityLabel(scores({ liquidityScore: 69, riskScore: 0 }))).toBe(
      "conservative",
    );
  });

  it("uses conservative through risk 35, then not at 36", () => {
    expect(
      personalityLabel(scores({ liquidityScore: 69, riskScore: 35, horizonScore: 100 })),
    ).toBe("conservative");
    expect(
      personalityLabel(
        scores({
          liquidityScore: 69,
          riskScore: 36,
          horizonScore: 50,
          experienceScore: 0,
        }),
      ),
    ).toBe("balanced");
  });

  it("uses balanced at risk 55 with horizon 50, and the else branch", () => {
    expect(
      personalityLabel(
        scores({
          liquidityScore: 69,
          riskScore: 55,
          horizonScore: 50,
          experienceScore: 0,
        }),
      ),
    ).toBe("balanced");
    expect(
      personalityLabel(
        scores({
          liquidityScore: 69,
          riskScore: 55,
          horizonScore: 49,
          experienceScore: 39,
        }),
      ),
    ).toBe("balanced");
    expect(
      personalityLabel(
        scores({
          liquidityScore: 69,
          riskScore: 76,
          horizonScore: 100,
          experienceScore: 54,
        }),
      ),
    ).toBe("balanced");
  });

  it("uses growth through risk 75 and experience 40", () => {
    expect(
      personalityLabel(
        scores({
          liquidityScore: 69,
          riskScore: 75,
          horizonScore: 0,
          experienceScore: 40,
        }),
      ),
    ).toBe("growth");
    expect(
      personalityLabel(
        scores({
          liquidityScore: 69,
          riskScore: 56,
          horizonScore: 49,
          experienceScore: 40,
        }),
      ),
    ).toBe("growth");
    expect(
      personalityLabel(
        scores({
          liquidityScore: 69,
          riskScore: 75,
          horizonScore: 0,
          experienceScore: 39,
        }),
      ),
    ).toBe("balanced");
  });

  it("uses aggressive only above risk 75 with experience at least 55", () => {
    expect(
      personalityLabel(
        scores({
          liquidityScore: 69,
          riskScore: 76,
          horizonScore: 0,
          experienceScore: 55,
        }),
      ),
    ).toBe("aggressive");
    expect(
      personalityLabel(
        scores({
          liquidityScore: 69,
          riskScore: 75,
          horizonScore: 0,
          experienceScore: 100,
        }),
      ),
    ).toBe("growth");
    expect(
      personalityLabel(
        scores({
          liquidityScore: 70,
          riskScore: 100,
          experienceScore: 100,
        }),
      ),
    ).toBe("capital_preserver");
  });
});

describe("scorePersonality labels from answers", () => {
  it("classifies a low-risk quiz as conservative", () => {
    const result = scorePersonality(
      answers({
        risk_comfort: "rc_3",
        time_horizon: "th_1",
        experience: "ex_1",
        loss_reaction: "lr_1",
        liquidity_need: "ln_5",
      }),
    );
    expect(result.riskScore).toBe(28);
    expect(result.liquidityScore).toBe(30);
    expect(result.label).toBe("conservative");
  });

  it("classifies mid risk and a long horizon as balanced", () => {
    const result = scorePersonality(
      answers({
        risk_comfort: "rc_1",
        time_horizon: "th_3",
        experience: "ex_1",
        loss_reaction: "lr_4",
        liquidity_need: "ln_5",
      }),
    );
    expect(result.riskScore).toBe(38);
    expect(result.horizonScore).toBe(53);
    expect(result.liquidityScore).toBe(22);
    expect(result.label).toBe("balanced");
  });

  it("classifies higher risk with experience as growth, and the top band as aggressive", () => {
    const growth = scorePersonality(
      answers({
        risk_comfort: "rc_5",
        time_horizon: "th_1",
        experience: "ex_3",
        loss_reaction: "lr_3",
        liquidity_need: "ln_5",
      }),
    );
    expect(growth.riskScore).toBe(75);
    expect(growth.experienceScore).toBe(56);
    expect(growth.label).toBe("growth");

    const aggressive = scorePersonality(
      answers({
        risk_comfort: "rc_5",
        time_horizon: "th_1",
        experience: "ex_3",
        loss_reaction: "lr_4",
        liquidity_need: "ln_5",
      }),
    );
    expect(aggressive.riskScore).toBe(88);
    expect(aggressive.experienceScore).toBe(56);
    expect(aggressive.liquidityScore).toBe(4);
    expect(aggressive.label).toBe("aggressive");
  });
});
