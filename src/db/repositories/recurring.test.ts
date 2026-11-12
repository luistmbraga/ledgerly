import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as schema from "@/db/schema";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const migrationsDir = path.join(__dirname, "../../../drizzle");
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), "utf-8"));
  }
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("@/db/client", () => ({ db: testDb }));

const {
  createTemplate,
  deleteTemplate,
  listDue,
  postDue,
  setTemplateActive,
} = await import("./recurring");
const { listExpenses } = await import("./expenses");
const { listIncomes } = await import("./incomes");
const { createAsset } = await import("./assets");
const { addAssetSnapshot, listSnapshotsForAsset } = await import("./snapshots");
const { createCategory } = await import("./categories");
const { exportDatabase, importDatabase } = await import("./backup");

type TemplateInput = Parameters<typeof createTemplate>[0];

function template(overrides: Partial<TemplateInput> = {}) {
  return createTemplate({
    kind: "expense",
    amountCents: 85_000,
    amountVaries: false,
    categoryId: null,
    assetId: null,
    note: "Rent",
    cadence: "monthly",
    anchorOn: "2026-01-31",
    endOn: null,
    ...overrides,
  });
}

function seedCashAsset() {
  return createAsset({
    name: "Checking",
    type: "cash",
    isLiquid: true,
    includeInAllocation: true,
    sleevePercents: { cash: 100, bonds: 0, equities: 0, other: 0 },
    notes: null,
  });
}

function postAll(asOfDate: string) {
  return postDue(
    asOfDate,
    listDue(asOfDate).map((d) => ({ templateId: d.templateId, period: d.period, amountCents: d.amountCents })),
  );
}

beforeEach(() => {
  testDb.delete(schema.expenses).run();
  testDb.delete(schema.incomes).run();
  testDb.delete(schema.recurringTemplates).run();
  testDb.delete(schema.valueSnapshots).run();
  testDb.delete(schema.assets).run();
  testDb.delete(schema.categories).run();
});

describe("recurring templates", () => {
  it("lists month-end due dates and posts them once", () => {
    template();
    expect(listDue("2026-04-30").map((d) => d.occurredOn)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);

    const first = postAll("2026-04-30");
    expect(first.posted).toHaveLength(4);
    expect(listDue("2026-04-30")).toEqual([]);

    const again = postDue("2026-04-30", [
      { templateId: first.posted[0].templateId, period: "2026-02", amountCents: 85_000 },
    ]);
    expect(again).toEqual({ posted: [], skipped: 1 });
    expect(listExpenses()).toHaveLength(4);
  });

  it("rejects a duplicate period at the database level", () => {
    const t = template();
    postAll("2026-01-31");
    const now = new Date().toISOString();
    expect(() =>
      testDb
        .insert(schema.expenses)
        .values({
          amountCents: 1,
          occurredOn: "2026-01-31",
          recurringTemplateId: t.id,
          recurringPeriod: "2026-01",
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it("posts the edited amount without changing the template", () => {
    const t = template({ amountVaries: true, note: "Electricity", amountCents: 4_500 });
    postDue("2026-01-31", [{ templateId: t.id, period: "2026-01", amountCents: 4_389 }]);
    expect(listExpenses()[0].amountCents).toBe(4_389);
    expect(listDue("2026-02-28")[0].amountCents).toBe(4_500);
  });

  it("refuses a period that is not due", () => {
    const t = template();
    expect(() =>
      postDue("2026-02-15", [{ templateId: t.id, period: "2026-02", amountCents: 85_000 }]),
    ).toThrow(/not due/);
    expect(listExpenses()).toHaveLength(0);
  });

  it("hides paused templates and shows missed periods after resuming", () => {
    const t = template({ anchorOn: "2026-01-10" });
    setTemplateActive(t.id, false);
    expect(listDue("2026-03-15")).toEqual([]);
    setTemplateActive(t.id, true);
    expect(listDue("2026-03-15").map((d) => d.period)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("posts incomes into the incomes table", () => {
    template({ kind: "income", note: "Salary", amountCents: 308_511, anchorOn: "2026-10-26" });
    postAll("2026-11-12");
    expect(listIncomes().map((r) => r.occurredOn)).toEqual(["2026-10-26"]);
    expect(listExpenses()).toHaveLength(0);
  });

  it("rejects a category of the wrong kind", () => {
    const income = createCategory({ name: "Salary", kind: "income", isEssential: false });
    expect(() => template({ categoryId: income.id })).toThrow(/expense category/);
  });

  it("keeps posted rows when the template is deleted", () => {
    const t = template({ anchorOn: "2026-10-01" });
    postAll("2026-11-12");
    expect(deleteTemplate(t.id)).toBe(true);
    const rows = listExpenses();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.recurringTemplateId === null)).toBe(true);
  });
});

describe("recurring templates with a cash account", () => {
  it("links rows on or after the latest balance and posts older ones unlinked", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-02-15", amountCents: 500_000, note: null });
    template({ assetId: asset.id });

    const result = postAll("2026-03-31");
    expect(result.posted.map((p) => [p.occurredOn, p.linked])).toEqual([
      ["2026-01-31", false],
      ["2026-02-28", true],
      ["2026-03-31", true],
    ]);
    expect(result.posted[0].unlinkedReason).toMatch(/2026-02-15/);
    const latest = listSnapshotsForAsset(asset.id)[0];
    expect(latest.amountCents).toBe(500_000 - 2 * 85_000);
  });

  it("rolls back the whole batch when a linked row would make the balance negative", () => {
    const asset = seedCashAsset();
    addAssetSnapshot(asset.id, { recordedOn: "2026-01-01", amountCents: 100_000, note: null });
    template({ assetId: asset.id });
    expect(() => postAll("2026-02-28")).toThrow(/negative/);
    expect(listExpenses()).toHaveLength(0);
    expect(listSnapshotsForAsset(asset.id)).toHaveLength(1);
  });
});

describe("backup round-trip", () => {
  it("restores templates and posted-row links", () => {
    const t = template({ anchorOn: "2026-10-01" });
    postAll("2026-11-12");
    const backup = JSON.parse(JSON.stringify(exportDatabase()));
    expect(importDatabase(backup)).toEqual({ ok: true });
    expect(listDue("2026-11-12")).toEqual([]);
    expect(listExpenses().map((r) => [r.recurringTemplateId, r.recurringPeriod])).toEqual([
      [t.id, "2026-11"],
      [t.id, "2026-10"],
    ]);
  });

  it("accepts an older backup without recurring data", () => {
    template();
    const backup = JSON.parse(JSON.stringify(exportDatabase()));
    delete backup.recurring_templates;
    for (const row of backup.expenses) {
      delete row.recurringTemplateId;
      delete row.recurringPeriod;
    }
    expect(importDatabase(backup)).toEqual({ ok: true });
  });
});
