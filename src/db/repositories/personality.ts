import { eq } from "drizzle-orm";
import {
  scorePersonality,
  PERSONALITY_QUESTION_KEYS,
  type PersonalityAnswers,
} from "@/domain/personality";
import { db } from "../client";
import {
  investorProfiles,
  personalityAnswers,
  type InvestorProfileRow,
} from "../schema";
import { updateSettings } from "./settings";

const PROFILE_ID = 1;

export type InvestorProfileRecord = InvestorProfileRow;

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

function assertAnswers(input: PersonalityAnswers): PersonalityAnswers {
  const answers = {} as PersonalityAnswers;
  for (const key of PERSONALITY_QUESTION_KEYS) {
    const optionId = input[key];
    if (typeof optionId !== "string" || optionId.trim() === "") {
      invalid("Answer all five questions.");
    }
    answers[key] = optionId.trim();
  }
  try {
    scorePersonality(answers);
  } catch (error) {
    invalid(error instanceof Error ? error.message : "Answer all five questions.");
  }
  return answers;
}

export function getInvestorProfile(): InvestorProfileRecord | undefined {
  return db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.id, PROFILE_ID))
    .get();
}

export function savePersonalityAssessment(
  input: PersonalityAnswers,
): InvestorProfileRecord {
  const answers = assertAnswers(input);
  const scored = scorePersonality(answers);
  const now = new Date().toISOString();

  const saved = db.transaction((tx) => {
    for (const key of PERSONALITY_QUESTION_KEYS) {
      tx.insert(personalityAnswers)
        .values({
          questionKey: key,
          optionId: answers[key],
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: personalityAnswers.questionKey,
          set: { optionId: answers[key], updatedAt: now },
        })
        .run();
    }

    tx.insert(investorProfiles)
      .values({
        id: PROFILE_ID,
        label: scored.label,
        riskScore: scored.riskScore,
        horizonScore: scored.horizonScore,
        experienceScore: scored.experienceScore,
        liquidityScore: scored.liquidityScore,
        completedAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: investorProfiles.id,
        set: {
          label: scored.label,
          riskScore: scored.riskScore,
          horizonScore: scored.horizonScore,
          experienceScore: scored.experienceScore,
          liquidityScore: scored.liquidityScore,
          completedAt: now,
        },
      })
      .run();

    updateSettings({ personalityRevealedAt: now }, tx);

    const profile = tx
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.id, PROFILE_ID))
      .get();
    if (!profile) {
      invalid("Could not save the investor profile.");
    }
    return profile;
  });

  return saved;
}

export function clearPersonalityAssessment(): void {
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(personalityAnswers).run();
    tx.delete(investorProfiles).run();
    updateSettings({ personalityRevealedAt: null }, tx);
  });
}

