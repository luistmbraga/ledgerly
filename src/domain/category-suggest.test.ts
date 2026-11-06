import { describe, expect, it } from "vitest";
import {
  recentCategoryLabels,
  suggestCategoryFallback,
} from "./category-suggest";

const categories = [
  { id: 4, name: "Transport" },
  { id: 5, name: "Dining" },
  { id: 6, name: "Groceries" },
];

describe("suggestCategoryFallback", () => {
  it("maps the first word uber to Transport", () => {
    expect(
      suggestCategoryFallback({
        note: "Uber airport",
        asOf: "2026-03-01",
        categories,
        recentExpenses: [
          { occurredOn: "2026-02-01", categoryId: 6, note: "Market" },
          { occurredOn: "2026-02-02", categoryId: 6, note: "Market" },
        ],
      }),
    ).toEqual({
      categoryId: 4,
      rationale: "The note matches Transport.",
    });
  });

  it("uses the most frequent category from the last 90 days when no keyword matches", () => {
    expect(
      suggestCategoryFallback({
        note: "Misc",
        asOf: "2026-03-31",
        categories,
        recentExpenses: [
          { occurredOn: "2025-12-31", categoryId: 5, note: "A" },
          { occurredOn: "2025-12-30", categoryId: 6, note: "Too old" },
          { occurredOn: "2026-03-01", categoryId: 6, note: "B" },
          { occurredOn: "2026-02-01", categoryId: 6, note: "C" },
          { occurredOn: "2026-04-01", categoryId: 5, note: "Future" },
        ],
      }).categoryId,
    ).toBe(6);
  });

  it("leaves the category empty when nothing matches", () => {
    expect(
      suggestCategoryFallback({
        note: "",
        asOf: "2026-03-01",
        categories,
        recentExpenses: [],
      }),
    ).toEqual({
      categoryId: null,
      rationale: "No keyword or recent category matched this note.",
    });
  });
});

describe("recentCategoryLabels", () => {
  it("counts the first word of categorized notes inside 90 days", () => {
    expect(
      recentCategoryLabels(
        [
          { occurredOn: "2026-02-01", categoryId: 4, note: "Uber airport" },
          { occurredOn: "2026-02-02", categoryId: 4, note: "Uber home" },
          { occurredOn: "2025-01-01", categoryId: 4, note: "Uber old" },
          { occurredOn: "2026-02-03", categoryId: null, note: "Uber none" },
        ],
        "2026-03-01",
      ),
    ).toEqual([{ notePrefix: "uber", categoryId: 4, count: 2 }]);
  });
});
