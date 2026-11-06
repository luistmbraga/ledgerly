import { describe, expect, it, vi } from "vitest";
import { memoryAiResultStore } from "@/db/repositories/ai-results";
import { completeJson, readAiConfig } from "./client";
import { hashInput } from "./hash";
import { suggestCategory } from "./tasks/category-suggest";
import { explainGoal } from "./tasks/goal-explain";
import { narrateBriefing } from "./tasks/briefing";
import { narrateTips } from "./tasks/tips";
import { BRIEFING_DISCLAIMER } from "./prompts/briefing";
import {
  briefingProhibitedReason,
  numbersMissingFromInput,
} from "./validate";
import type { BriefingDecision } from "@/domain/allocation";

const keyEnv = { AI_API_KEY: "test-key", AI_BASE_URL: "https://example.test/v1" };
const noKeyEnv = { AI_API_KEY: "" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) } }],
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

const decision: BriefingDecision = {
  priorities: ["build_emergency_fund", "reserve_short_goals", "align_to_band"],
  targetBand: { cash: 15, bonds: 35, equities: 45, other: 5 },
  currentMixPercent: { cash: 40, bonds: 0, equities: 50, other: 10 },
  drift: { cash: 25, bonds: -35, equities: 5, other: 5 },
  emergencyGapCents: 300_000,
  shortGoalRemainingCents: 1_000_000,
  profileLabel: "balanced",
  profileTitle: "Balanced",
};

const categoryRequest = {
  expenseId: 42,
  amountCents: 1250,
  occurredOn: "2026-03-01",
  note: "Uber airport",
  categories: [{ id: 4, name: "Transport", isEssential: false }],
  recentExpenses: [],
};

describe("readAiConfig", () => {
  it("treats a blank key as missing and defaults the model", () => {
    expect(readAiConfig({ AI_API_KEY: "  " })).toBeNull();
    expect(
      readAiConfig({ AI_API_KEY: "abc", AI_BASE_URL: "https://example.test/v1/" }),
    ).toEqual({
      apiKey: "abc",
      baseUrl: "https://example.test/v1",
      model: "gpt-4o-mini",
    });
  });
});

describe("hashInput", () => {
  it("ignores object key order", () => {
    expect(hashInput({ b: 1, a: { d: 2, c: 3 } })).toBe(
      hashInput({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });
});

describe("validators", () => {
  it("rejects a briefing that names a ticker", () => {
    expect(
      briefingProhibitedReason({
        headline: "Buy AAPL",
        sections: [{ heading: "Mix", body: "Stay with the band." }],
        disclaimer: BRIEFING_DISCLAIMER,
      }),
    ).toBe("AAPL");
  });

  it("rejects numbers that are not in the input", () => {
    expect(
      numbersMissingFromInput({ amountCents: 1250 }, { rationale: "Save 99999." }),
    ).toEqual(["99999"]);
  });
});

describe("AI tasks without a key", () => {
  it("uses templates for all four tasks and does not call fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const store = memoryAiResultStore();
    const deps = { env: noKeyEnv, fetchImpl, store };

    const category = await suggestCategory(categoryRequest, deps);
    expect(category.source).toBe("fallback");
    expect(category.output.categoryId).toBe(4);

    const tips = await narrateTips(
      {
        currency: "EUR",
        cashflow: {
          trailingMonths: 3,
          incomeCents: 100,
          expenseCents: 90,
          surplusCents: 10,
          savingsRate: 0.1,
          essentialMonthlyAverageCents: 30,
          discretionaryShareOfExpenses: null,
          uncategorizedExpenseShare: null,
        },
        emergencyFund: {
          targetMonths: 6,
          targetCents: 0,
          eligibleCents: 0,
          fundedRatio: 1,
          gapCents: 0,
          avgMonthlySurplusCents: 0,
          monthsToCloseGap: null,
        },
        findings: [
          {
            id: "emergency_fund_met",
            severity: "info",
            data: { fundedRatio: 1, currency: "EUR" },
          },
        ],
      },
      deps,
    );
    expect(tips.source).toBe("fallback");
    expect(tips.output.tips[0]?.title).toBe("Emergency fund met");

    const goal = await explainGoal(
      {
        currency: "EUR",
        avgMonthlySurplusCents: 0,
        goal: {
          id: 1,
          name: "Holiday",
          bucket: "short",
          targetAmountCents: 1000,
          targetDate: "2026-12-01",
          setAsideCents: 0,
          remainingCents: 1000,
          requiredMonthlyCents: 1000,
          status: "shortfall",
          plannedMonthlyCents: 0,
          expectedAnnualReturnBps: null,
        },
      },
      deps,
    );
    expect(goal.source).toBe("fallback");
    expect(goal.output.summary.length).toBeGreaterThan(0);
    expect(goal.output.steps.length).toBeGreaterThan(0);

    const briefing = await narrateBriefing(
      { decision, snapshotNetWorthCents: 25_000_000, currency: "EUR" },
      deps,
    );
    expect(briefing.source).toBe("fallback");
    expect(briefing.output.disclaimer).toBe(BRIEFING_DISCLAIMER);
    expect(briefing.output.headline).toContain("Balanced");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("AI tasks with a mocked API", () => {
  it("keeps a category id that is in the list", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        categoryId: 4,
        confidence: "high",
        rationale: "The note matches transport.",
      }),
    );
    const result = await suggestCategory(categoryRequest, {
      env: keyEnv,
      fetchImpl,
      store: memoryAiResultStore(),
    });
    expect(result.source).toBe("ai");
    expect(result.output.categoryId).toBe(4);
  });

  it("falls back when the model returns a category id outside the list", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        categoryId: 99,
        confidence: "high",
        rationale: "Unknown.",
      }),
    );
    const result = await suggestCategory(categoryRequest, {
      env: keyEnv,
      fetchImpl,
      store: memoryAiResultStore(),
    });
    expect(result.source).toBe("fallback");
    expect(result.output.categoryId).toBe(4);
  });

  it("rejects a briefing that mentions AAPL and uses the template", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        headline: "Buy AAPL",
        sections: [{ heading: "Trade", body: "Add AAPL now." }],
        disclaimer: BRIEFING_DISCLAIMER,
      }),
    );
    const result = await narrateBriefing(
      { decision, snapshotNetWorthCents: 25_000_000, currency: "EUR" },
      { env: keyEnv, fetchImpl, store: memoryAiResultStore() },
    );
    expect(result.source).toBe("fallback");
    expect(result.output.headline).not.toContain("AAPL");
    expect(result.output.disclaimer).toBe(BRIEFING_DISCLAIMER);
  });

  it("rejects output that introduces a new number", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        categoryId: 4,
        confidence: "high",
        rationale: "Save 99999 more.",
      }),
    );
    const result = await suggestCategory(categoryRequest, {
      env: keyEnv,
      fetchImpl,
      store: memoryAiResultStore(),
    });
    expect(result.source).toBe("fallback");
  });

  it("serves the second call from cache", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        categoryId: 4,
        confidence: "medium",
        rationale: "The note matches transport.",
      }),
    );
    const store = memoryAiResultStore();
    const deps = { env: keyEnv, fetchImpl, store };
    const first = await suggestCategory(categoryRequest, deps);
    const second = await suggestCategory(categoryRequest, deps);
    expect(first.source).toBe("ai");
    expect(second.source).toBe("cache");
    expect(second.output.categoryId).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a failed request once", async () => {
    let calls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: "nope" }, 500);
      return jsonResponse({
        categoryId: 4,
        confidence: "low",
        rationale: "Matched.",
      });
    });
    const result = await suggestCategory(categoryRequest, {
      env: keyEnv,
      fetchImpl,
      store: memoryAiResultStore(),
    });
    expect(result.source).toBe("ai");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("completeJson", () => {
  it("returns an error when both attempts fail", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}, 503));
    const result = await completeJson({
      config: {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "gpt-4o-mini",
      },
      system: "system",
      user: "{}",
      schemaName: "category_suggest",
      schema: { type: "object" },
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
