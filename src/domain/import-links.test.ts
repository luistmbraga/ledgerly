import { describe, expect, it } from "vitest";
import { planCashLinks, type LinkPlanRow } from "./import-links";

const rows: LinkPlanRow[] = [
  { position: 1, occurredOn: "2026-10-01", kind: "expense", amountCents: 1_000 },
  { position: 2, occurredOn: "2026-10-05", kind: "income", amountCents: 5_000 },
  { position: 3, occurredOn: "2026-10-09", kind: "expense", amountCents: 20_000 },
];

describe("planCashLinks", () => {
  it("closing mode writes unless a balance on or after the period end exists", () => {
    const base = { mode: "closing" as const, rows, closingBalanceCents: 10_000, periodTo: "2026-10-31" };
    expect(planCashLinks({ ...base, latest: { recordedOn: "2026-10-30", amountCents: 1 } }).closing).toBe("write");
    expect(planCashLinks({ ...base, latest: { recordedOn: "2026-10-31", amountCents: 1 } }).closing).toBe("skip_newer");
    expect(planCashLinks({ ...base, latest: null, closingBalanceCents: null }).closing).toBe("unavailable");
    expect(planCashLinks({ ...base, latest: null, closingBalanceCents: -5 }).closing).toBe("skip_negative");
  });

  it("per-row mode leaves rows before the latest balance unlinked", () => {
    const plan = planCashLinks({
      mode: "per_row",
      rows,
      latest: { recordedOn: "2026-10-03", amountCents: 100_000 },
      closingBalanceCents: null,
      periodTo: null,
    });
    expect([...plan.unlinked]).toEqual([1]);
    expect(plan.snapshotsAdded).toBe(2);
    expect(plan.negativeAt).toBeNull();
  });

  it("per-row mode reports the first row that would go negative", () => {
    const plan = planCashLinks({
      mode: "per_row",
      rows,
      latest: { recordedOn: "2026-09-30", amountCents: 2_000 },
      closingBalanceCents: null,
      periodTo: null,
    });
    expect(plan.negativeAt).toBe(3);
  });

  it("none mode changes nothing", () => {
    const plan = planCashLinks({ mode: "none", rows, latest: null, closingBalanceCents: 1, periodTo: "2026-10-31" });
    expect(plan).toMatchObject({ snapshotsAdded: 0, negativeAt: null, closing: "not_applicable" });
  });
});
