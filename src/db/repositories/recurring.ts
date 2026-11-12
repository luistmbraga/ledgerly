import { and, asc, eq, isNotNull } from "drizzle-orm";
import {
  duePeriods,
  isCadence,
  type Cadence,
  type RecurringSchedule,
} from "@/domain/recurring";
import { isValidIsoDate } from "@/lib/dates";
import { db } from "../client";
import {
  assets,
  categories,
  expenses,
  incomes,
  recurringTemplates,
  valueSnapshots,
  type RecurringTemplateRow,
} from "../schema";
import { getCategory } from "./categories";
import { insertExpense } from "./expenses";
import { insertIncome } from "./incomes";
import type { Tx } from "./cash-link";
import { selectLatestSnapshot } from "@/domain/net-worth";

export type RecurringKind = "expense" | "income";

export type RecurringTemplate = RecurringTemplateRow & {
  kind: RecurringKind;
  cadence: Cadence;
};

export type RecurringTemplateWithNames = RecurringTemplate & {
  categoryName: string | null;
  assetName: string | null;
};

export type RecurringTemplateInput = {
  kind: RecurringKind;
  amountCents: number;
  amountVaries: boolean;
  categoryId: number | null;
  assetId: number | null;
  note: string;
  cadence: Cadence;
  anchorOn: string;
  endOn: string | null;
};

export type DueItem = {
  templateId: number;
  kind: RecurringKind;
  period: string;
  occurredOn: string;
  amountCents: number;
  amountVaries: boolean;
  note: string | null;
  categoryName: string | null;
  assetName: string | null;
};

export type PostRequest = { templateId: number; period: string; amountCents: number };

export type PostedItem = {
  templateId: number;
  period: string;
  occurredOn: string;
  note: string | null;
  linked: boolean;
  /** Set when the template links a cash account but this row could not be linked. */
  unlinkedReason: string | null;
};

export type PostDueResult = { posted: PostedItem[]; skipped: number };

function invalid(message: string): never {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

function toTemplate<T extends RecurringTemplateRow>(row: T): T & RecurringTemplate {
  if ((row.kind !== "expense" && row.kind !== "income") || !isCadence(row.cadence)) {
    invalid(`Recurring template ${row.id} is corrupt.`);
  }
  return row as T & RecurringTemplate;
}

function scheduleOf(template: RecurringTemplate): RecurringSchedule {
  return {
    cadence: template.cadence,
    anchorOn: template.anchorOn,
    endOn: template.endOn,
    active: template.active,
  };
}

function assertTemplateInput(input: RecurringTemplateInput): RecurringTemplateInput {
  if (input.kind !== "expense" && input.kind !== "income") invalid("Choose expense or income.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    invalid("Enter an amount greater than zero.");
  }
  if (!isCadence(input.cadence)) invalid("Choose how often it repeats.");
  if (!isValidIsoDate(input.anchorOn)) invalid("Enter a valid first date.");
  if (input.endOn !== null) {
    if (!isValidIsoDate(input.endOn)) invalid("Enter a valid end date.");
    if (input.endOn < input.anchorOn) invalid("End date must be on or after the first date.");
  }
  const note = input.note.trim();
  if (note.length === 0) invalid("Enter a description.");
  if (note.length > 500) invalid("Description must be 500 characters or fewer.");
  if (input.categoryId !== null) {
    const category = getCategory(input.categoryId);
    if (!category || category.kind !== input.kind) {
      invalid(`Choose an ${input.kind} category.`);
    }
  }
  if (input.assetId !== null) {
    const asset = db.select().from(assets).where(eq(assets.id, input.assetId)).get();
    if (!asset || asset.type !== "cash") invalid("Choose a cash account.");
  }
  return { ...input, note };
}

function rowValues(input: RecurringTemplateInput) {
  return {
    kind: input.kind,
    amountCents: input.amountCents,
    amountVaries: input.amountVaries,
    categoryId: input.categoryId,
    assetId: input.assetId,
    linkCash: input.assetId !== null,
    note: input.note,
    cadence: input.cadence,
    anchorOn: input.anchorOn,
    endOn: input.endOn,
  };
}

export function listTemplates(): RecurringTemplateWithNames[] {
  return db
    .select({
      id: recurringTemplates.id,
      kind: recurringTemplates.kind,
      amountCents: recurringTemplates.amountCents,
      amountVaries: recurringTemplates.amountVaries,
      matchText: recurringTemplates.matchText,
      categoryId: recurringTemplates.categoryId,
      assetId: recurringTemplates.assetId,
      linkCash: recurringTemplates.linkCash,
      note: recurringTemplates.note,
      cadence: recurringTemplates.cadence,
      anchorOn: recurringTemplates.anchorOn,
      endOn: recurringTemplates.endOn,
      active: recurringTemplates.active,
      createdAt: recurringTemplates.createdAt,
      updatedAt: recurringTemplates.updatedAt,
      categoryName: categories.name,
      assetName: assets.name,
    })
    .from(recurringTemplates)
    .leftJoin(categories, eq(recurringTemplates.categoryId, categories.id))
    .leftJoin(assets, eq(recurringTemplates.assetId, assets.id))
    .orderBy(asc(recurringTemplates.kind), asc(recurringTemplates.note), asc(recurringTemplates.id))
    .all()
    .map(toTemplate);
}

export function getTemplate(id: number): RecurringTemplate | undefined {
  const row = db.select().from(recurringTemplates).where(eq(recurringTemplates.id, id)).get();
  return row ? toTemplate(row) : undefined;
}

export function createTemplate(input: RecurringTemplateInput): RecurringTemplate {
  const value = assertTemplateInput(input);
  const now = new Date().toISOString();
  return toTemplate(
    db
      .insert(recurringTemplates)
      .values({ ...rowValues(value), active: true, createdAt: now, updatedAt: now })
      .returning()
      .get(),
  );
}

export function updateTemplate(
  id: number,
  input: RecurringTemplateInput,
): RecurringTemplate | undefined {
  if (!getTemplate(id)) return undefined;
  const value = assertTemplateInput(input);
  return toTemplate(
    db
      .update(recurringTemplates)
      .set({ ...rowValues(value), updatedAt: new Date().toISOString() })
      .where(eq(recurringTemplates.id, id))
      .returning()
      .get(),
  );
}

export function setTemplateActive(id: number, active: boolean): boolean {
  const result = db
    .update(recurringTemplates)
    .set({ active, updatedAt: new Date().toISOString() })
    .where(eq(recurringTemplates.id, id))
    .run();
  return result.changes > 0;
}

/** Posted rows keep their data; the FK sets recurring_template_id to null. */
export function deleteTemplate(id: number): boolean {
  const result = db.delete(recurringTemplates).where(eq(recurringTemplates.id, id)).run();
  return result.changes > 0;
}

function postedPeriods(
  executor: Tx | typeof db,
  template: RecurringTemplate,
): Set<string> {
  const table = template.kind === "expense" ? expenses : incomes;
  const rows = executor
    .select({ period: table.recurringPeriod })
    .from(table)
    .where(and(eq(table.recurringTemplateId, template.id), isNotNull(table.recurringPeriod)))
    .all();
  return new Set(rows.map((row) => row.period!));
}

export function listDue(asOfDate: string): DueItem[] {
  const items: DueItem[] = [];
  for (const template of listTemplates()) {
    for (const due of duePeriods(scheduleOf(template), postedPeriods(db, template), asOfDate)) {
      items.push({
        templateId: template.id,
        kind: template.kind,
        period: due.period,
        occurredOn: due.occurredOn,
        amountCents: template.amountCents,
        amountVaries: template.amountVaries,
        note: template.note,
        categoryName: template.categoryName,
        assetName: template.assetName,
      });
    }
  }
  return items.sort(
    (a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.templateId - b.templateId,
  );
}

function latestSnapshotDate(tx: Tx, assetId: number): string | null {
  const rows = tx
    .select()
    .from(valueSnapshots)
    .where(eq(valueSnapshots.assetId, assetId))
    .all();
  return selectLatestSnapshot(rows)?.recordedOn ?? null;
}

/**
 * Post the selected due occurrences in one transaction, oldest first.
 * Dates come from the template schedule, never from the caller. A period that is
 * already posted is skipped. A linked row dated before the account's latest
 * balance is posted unlinked rather than rejected.
 */
export function postDue(asOfDate: string, requests: PostRequest[]): PostDueResult {
  for (const request of requests) {
    if (!Number.isSafeInteger(request.amountCents) || request.amountCents <= 0) {
      invalid("Enter an amount greater than zero for every selected entry.");
    }
  }

  return db.transaction((tx) => {
    const planned: Array<PostRequest & { template: RecurringTemplate; occurredOn: string }> = [];
    let skipped = 0;
    const seen = new Set<string>();

    for (const request of requests) {
      const key = `${request.templateId}:${request.period}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const row = tx
        .select()
        .from(recurringTemplates)
        .where(eq(recurringTemplates.id, request.templateId))
        .get();
      if (!row) invalid("A selected recurring entry no longer exists. Reload and try again.");
      const template = toTemplate(row);

      const posted = postedPeriods(tx, template);
      if (posted.has(request.period)) {
        skipped += 1;
        continue;
      }
      const due = duePeriods(scheduleOf(template), posted, asOfDate).find(
        (occurrence) => occurrence.period === request.period,
      );
      if (!due) invalid(`"${template.note ?? "Recurring entry"}" is not due for ${request.period}.`);
      planned.push({ ...request, template, occurredOn: due.occurredOn });
    }

    planned.sort(
      (a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.templateId - b.templateId,
    );

    const results: PostedItem[] = [];
    for (const item of planned) {
      const { template } = item;
      let assetId = template.linkCash ? template.assetId : null;
      let unlinkedReason: string | null = null;
      if (assetId !== null) {
        const latest = latestSnapshotDate(tx, assetId);
        if (latest !== null && item.occurredOn < latest) {
          unlinkedReason = `Posted without the cash link: the account already has a newer balance on ${latest}.`;
          assetId = null;
        }
      }
      const input = {
        amountCents: item.amountCents,
        occurredOn: item.occurredOn,
        categoryId: template.categoryId,
        assetId,
        note: template.note,
      };
      const link = { templateId: template.id, period: item.period };
      if (template.kind === "expense") insertExpense(tx, input, link);
      else insertIncome(tx, input, link);
      results.push({
        templateId: template.id,
        period: item.period,
        occurredOn: item.occurredOn,
        note: template.note,
        linked: assetId !== null,
        unlinkedReason,
      });
    }
    return { posted: results, skipped };
  });
}
