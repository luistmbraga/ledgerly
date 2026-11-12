import { describe, expect, it } from "vitest";
import type { ImportFlag } from "./import-dedupe";
import { toCandidates } from "./import-normalize";
import { buildRecurringReconciles, resolveRecurringUpdates } from "./import-recurring";

const candidates = toCandidates([
  { position: 1, occurredOn: "2026-10-27", description: "ENDESA ENERGIA", amountCents: -4_389, issue: null },
  { position: 2, occurredOn: "2026-10-21", description: "REALVSEGUROS", amountCents: -800, issue: null },
  { position: 3, occurredOn: "2026-10-12", description: "CONTINENTE", amountCents: -6_027, issue: null },
]);

const flags = new Map<number, ImportFlag>([
  [1, { type: "likely_recurring", reason: "", matchId: 10, matchAmountCents: 4_500, matchOccurredOn: "2026-10-25" }],
  [2, { type: "likely_recurring", reason: "", matchId: 11, matchAmountCents: 800, matchOccurredOn: "2026-10-21" }],
  [3, { type: "likely_manual", reason: "", matchId: 12 }],
]);

describe("buildRecurringReconciles", () => {
  it("covers only recurring matches and marks which differ", () => {
    expect(buildRecurringReconciles(candidates, flags).map((r) => [r.position, r.entryId, r.differs])).toEqual([
      [1, 10, true],
      [2, 11, false],
    ]);
  });
});

describe("resolveRecurringUpdates", () => {
  const reconciles = buildRecurringReconciles(candidates, flags);

  it("updates only ticked rows that differ, and keeps the rest for the fingerprint", () => {
    const result = resolveRecurringUpdates(reconciles, [1, 2]);
    expect(result.ok && result.items.map((i) => [i.position, i.update])).toEqual([
      [1, true],
      [2, false],
    ]);
    const none = resolveRecurringUpdates(reconciles, []);
    expect(none.ok && none.items.every((i) => !i.update)).toBe(true);
  });

  it("rejects a position the server no longer flags as recurring", () => {
    expect(resolveRecurringUpdates(reconciles, [3])).toEqual({
      ok: false,
      error: "This preview is out of date. Preview the file again.",
    });
  });
});
