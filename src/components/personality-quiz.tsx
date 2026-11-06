"use client";

import { useState } from "react";
import { PERSONALITY_QUESTIONS } from "@/domain/personality";

const DISCLAIMER =
  "This quiz is a self-assessment for educational purposes. It is not a psychological or regulatory suitability test.";

type PersonalityQuizProps = {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
};

export function PersonalityQuiz({ action, error }: PersonalityQuizProps) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const answeredCount = PERSONALITY_QUESTIONS.filter((item) => selected[item.key]).length;
  const allAnswered = answeredCount === PERSONALITY_QUESTIONS.length;

  return (
    <form action={action} className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <p className="text-sm text-stone-600">{DISCLAIMER}</p>

      <p className="text-sm text-stone-600">
        {answeredCount} of {PERSONALITY_QUESTIONS.length} answered
      </p>

      {PERSONALITY_QUESTIONS.map((item) => (
        <fieldset key={item.key} className="flex flex-col gap-3">
          <legend className="text-lg font-semibold text-stone-900">{item.prompt}</legend>
          {item.options.map((option) => {
            const id = `${item.key}-${option.id}`;
            return (
              <label
                key={option.id}
                htmlFor={id}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-700"
              >
                <input
                  id={id}
                  type="radio"
                  name={item.key}
                  value={option.id}
                  checked={selected[item.key] === option.id}
                  onChange={() =>
                    setSelected((current) => ({ ...current, [item.key]: option.id }))
                  }
                  className="mt-0.5"
                  required
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </fieldset>
      ))}

      <button
        type="submit"
        disabled={!allAnswered}
        className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        See my result
      </button>
    </form>
  );
}
