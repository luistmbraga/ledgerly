import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  PERSONALITY_QUESTION_KEYS,
  PERSONALITY_TITLES,
  type PersonalityAnswers,
  type PersonalityLabel,
} from "@/domain/personality";
import {
  clearPersonalityAssessment,
  getInvestorProfile,
  savePersonalityAssessment,
} from "@/db/repositories/personality";
import { PersonalityQuiz } from "@/components/personality-quiz";
import { PersonalityReveal, PersonalitySummary } from "@/components/reveal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function refreshPersonality() {
  revalidatePath("/", "layout");
  revalidatePath("/personality");
  revalidatePath("/briefing");
}

async function submitPersonality(formData: FormData) {
  "use server";

  const answers = {} as PersonalityAnswers;
  for (const key of PERSONALITY_QUESTION_KEYS) {
    answers[key] = String(formData.get(key) ?? "").trim();
  }

  try {
    savePersonalityAssessment(answers);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "ValidationError"
        ? error.message
        : "Could not save the personality quiz.";
    redirect(`/personality?error=${encodeURIComponent(message)}`);
  }

  refreshPersonality();
  redirect("/personality?view=reveal");
}

async function retakePersonality() {
  "use server";
  clearPersonalityAssessment();
  refreshPersonality();
  redirect("/personality");
}

function titleFor(label: string): string {
  if (label in PERSONALITY_TITLES) {
    return PERSONALITY_TITLES[label as PersonalityLabel];
  }
  return label;
}

export default async function PersonalityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; view?: string }>;
}) {
  const params = await searchParams;
  const profile = getInvestorProfile();
  const view = profile
    ? {
        title: titleFor(profile.label),
        riskScore: profile.riskScore,
        horizonScore: profile.horizonScore,
        experienceScore: profile.experienceScore,
        liquidityScore: profile.liquidityScore,
      }
    : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Personality</h1>
        <p className="mt-1 text-sm text-stone-600">
          A short self-assessment that labels how you approach investing.
        </p>
      </header>
      <div className="mt-6">
        {view && params.view === "reveal" ? (
          <PersonalityReveal profile={view} />
        ) : view ? (
          <PersonalitySummary profile={view} retakeAction={retakePersonality} />
        ) : (
          <PersonalityQuiz action={submitPersonality} error={params.error} />
        )}
      </div>
    </div>
  );
}
