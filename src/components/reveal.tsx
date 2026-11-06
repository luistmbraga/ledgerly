"use client";

import Link from "next/link";
import { useRef } from "react";

export type PersonalityProfileView = {
  title: string;
  riskScore: number;
  horizonScore: number;
  experienceScore: number;
  liquidityScore: number;
};

const DIMENSIONS = [
  { key: "riskScore", label: "Risk" },
  { key: "horizonScore", label: "Horizon" },
  { key: "experienceScore", label: "Experience" },
  { key: "liquidityScore", label: "Liquidity" },
] as const;

function DimensionBars({ profile }: { profile: PersonalityProfileView }) {
  return (
    <ul className="flex flex-col gap-4">
      {DIMENSIONS.map((dimension) => {
        const score = profile[dimension.key];
        return (
          <li key={dimension.key}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-stone-800">{dimension.label}</span>
              <span className="text-stone-600">{score} / 100</span>
            </div>
            <div
              className="mt-1 h-2 rounded-full bg-stone-200"
              role="img"
              aria-label={`${dimension.label} score ${score} out of 100`}
            >
              <div
                className="h-2 rounded-full bg-teal-700"
                style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PersonalityReveal({ profile }: { profile: PersonalityProfileView }) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-teal-800">Your investor profile</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">
          {profile.title}
        </h2>
      </div>
      <DimensionBars profile={profile} />
      <div className="flex flex-wrap gap-2">
        <Link
          href="/"
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
        >
          Continue to dashboard
        </Link>
        <Link
          href="/briefing"
          className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
        >
          View briefing
        </Link>
      </div>
    </section>
  );
}

export function PersonalitySummary({
  profile,
  retakeAction,
}: {
  profile: PersonalityProfileView;
  retakeAction: () => void | Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-stone-600">Saved profile</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">
          {profile.title}
        </h2>
      </div>
      <DimensionBars profile={profile} />
      <div>
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
        >
          Retake quiz
        </button>
        <dialog
          ref={dialogRef}
          aria-labelledby="retake-title"
          className="w-[min(100%,24rem)] rounded-md border border-stone-200 p-0 text-stone-900 backdrop:bg-stone-900/40"
        >
          <div className="flex flex-col gap-4 p-4">
            <h2 id="retake-title" className="text-lg font-semibold">
              Retake the quiz?
            </h2>
            <p className="text-sm text-stone-700">
              This replaces your saved answers and profile. You will start the
              quiz again.
            </p>
            <div className="flex gap-2">
              <form action={retakeAction}>
                <button
                  type="submit"
                  className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
                >
                  Replace profile
                </button>
              </form>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </dialog>
      </div>
    </section>
  );
}
