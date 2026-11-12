import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { ExistingJournalRow, TemplateMatcher } from "@/domain/import-dedupe";
import type { ResolvedReconcile } from "@/domain/import-recurring";
import type { LinkMode } from "@/domain/import-links";
import type { CategoryHistoryRow, ImportKind } from "@/domain/import-normalize";
import { selectLatestSnapshot } from "@/domain/net-worth";
import { isCadence } from "@/domain/recurring";
import { addMonths, isValidIsoDate } from "@/lib/dates";
import { db } from "../client";
import {
  assets,
  expenses,
  importBatchUpdates,
  importBatches,
  incomes,
  recurringTemplates,
  valueSnapshots,
  type ImportBatchRow,
} from "../schema";
import { deleteCashLink, type Tx } from "./cash-link";
import { insertExpense, updateExpenseTx } from "./expenses";
import { insertIncome, updateIncomeTx } from "./incomes";

export type ImportRowInput = {
  position: number;
  occurredOn: string;
  kind: ImportKind;
  amountCents: number;
  categoryId: number | null;
  note: string;
  fingerprint: string;
};

export type ConfirmImportInput = {
  parserId: string;
  fileName: string;
  fileSha256: string;
  periodFrom: string | null;
  periodTo: string | null;
  closingBalanceCents: number | null;
  assetId: number | null;
  linkMode: LinkMode;
  rows: ImportRowInput[];
  /** Entries posted by recurring templates that this statement confirms. */
  recurring?: ResolvedReconcile[];
};

export type ConfirmImportResult = {
  batch: ImportBatchRow;
  updatedCount: number;
  unlinkedCount: number;
  closing: "written" | "skipped" | "none";
};

export type UndoImportResult =
  | { ok: true; removed: number }
  | { ok: false; error: string };

/** A validation error that names the statement row it came from. */
export class ImportRowError extends Error {
  constructor(
    message: string,
    readonly position: number | null,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

function invalid(message: string, position: number | null = null): never {
  throw new ImportRowError(message, position);
}

const CONTEXT_MARGIN_MONTHS = 2;

/** Journal rows and templates the duplicate checks compare against. */
export function getImportContext(fromDate: string, toDate: string): {
  existing: ExistingJournalRow[];
  templates: TemplateMatcher[];
  history: CategoryHistoryRow[];
} {
  const from = addMonths(fromDate, -CONTEXT_MARGIN_MONTHS);
  const to = addMonths(toDate, CONTEXT_MARGIN_MONTHS);
  const existing: ExistingJournalRow[] = [];
  const history: CategoryHistoryRow[] = [];

  for (const [kind, table] of [
    ["expense", expenses],
    ["income", incomes],
  ] as const) {
    const window = db
      .select()
      .from(table)
      .where(and(gte(table.occurredOn, from), lte(table.occurredOn, to)))
      .all();
    for (const row of window) {
      existing.push({
        id: row.id,
        kind,
        amountCents: row.amountCents,
        occurredOn: row.occurredOn,
        note: row.note,
        importFingerprint: row.importFingerprint,
        recurringTemplateId: row.recurringTemplateId,
        recurringPeriod: row.recurringPeriod,
      });
    }
    const categorized = db
      .select({ occurredOn: table.occurredOn, categoryId: table.categoryId, note: table.note })
      .from(table)
      .where(and(isNotNull(table.categoryId), isNotNull(table.note)))
      .all();
    for (const row of categorized) history.push({ kind, ...row });
  }

  const templates = db
    .select()
    .from(recurringTemplates)
    .all()
    .flatMap((t): TemplateMatcher[] =>
      (t.kind === "expense" || t.kind === "income") && isCadence(t.cadence)
        ? [{ id: t.id, kind: t.kind, cadence: t.cadence, matchText: t.matchText }]
        : [],
    );

  return { existing, templates, history };
}

export function listImportBatches(): Array<ImportBatchRow & { assetName: string | null }> {
  return db
    .select({
      id: importBatches.id,
      source: importBatches.source,
      parserId: importBatches.parserId,
      fileName: importBatches.fileName,
      fileSha256: importBatches.fileSha256,
      periodFrom: importBatches.periodFrom,
      periodTo: importBatches.periodTo,
      closingBalanceCents: importBatches.closingBalanceCents,
      assetId: importBatches.assetId,
      linkMode: importBatches.linkMode,
      closingSnapshotId: importBatches.closingSnapshotId,
      rowCount: importBatches.rowCount,
      createdAt: importBatches.createdAt,
      assetName: assets.name,
    })
    .from(importBatches)
    .leftJoin(assets, eq(importBatches.assetId, assets.id))
    .orderBy(desc(importBatches.createdAt), desc(importBatches.id))
    .all();
}

export function findBatchesByFileHash(fileSha256: string): ImportBatchRow[] {
  return db.select().from(importBatches).where(eq(importBatches.fileSha256, fileSha256)).all();
}

function latestAssetSnapshot(tx: Tx, assetId: number) {
  return selectLatestSnapshot(
    tx.select().from(valueSnapshots).where(eq(valueSnapshots.assetId, assetId)).all(),
  );
}

function assertRows(rows: ImportRowInput[], updates: number) {
  if (rows.length === 0 && updates === 0) invalid("Select at least one row to import.");
  for (const row of rows) {
    if (!isValidIsoDate(row.occurredOn)) invalid("This row has an invalid date.", row.position);
    if (!Number.isSafeInteger(row.amountCents) || row.amountCents <= 0) {
      invalid("This row has an invalid amount.", row.position);
    }
    if (row.note.length > 500) invalid("The note must be 500 characters or fewer.", row.position);
  }
}

/**
 * Writes the batch, its rows and the optional closing-balance snapshot in one
 * transaction. Any failing row aborts the whole import and is named in the error.
 */
export function confirmImport(input: ConfirmImportInput): ConfirmImportResult {
  const recurring = input.recurring ?? [];
  assertRows(input.rows, recurring.filter((r) => r.update).length);
  const linkMode: LinkMode = input.assetId === null ? "none" : input.linkMode;

  return db.transaction((tx) => {
    if (input.assetId !== null) {
      const asset = tx.select().from(assets).where(eq(assets.id, input.assetId)).get();
      if (!asset || asset.type !== "cash") invalid("Choose a cash account.");
    }

    const batch = tx
      .insert(importBatches)
      .values({
        source: "pdf",
        parserId: input.parserId,
        fileName: input.fileName.slice(0, 255),
        fileSha256: input.fileSha256,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        closingBalanceCents: input.closingBalanceCents,
        assetId: input.assetId,
        linkMode,
        closingSnapshotId: null,
        rowCount: input.rows.length,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();

    // Before inserts, so per-row cash links added below can't freeze these entries first.
    let updatedCount = 0;
    for (const item of recurring) {
      const table = item.kind === "expense" ? expenses : incomes;
      const entry = tx.select().from(table).where(eq(table.id, item.entryId)).get();
      if (!entry) invalid("The matched recurring entry no longer exists. Preview the file again.", item.position);
      tx.insert(importBatchUpdates)
        .values({
          batchId: batch.id,
          kind: item.kind,
          entryId: entry.id,
          previousAmountCents: entry.amountCents,
          previousOccurredOn: entry.occurredOn,
          previousFingerprint: entry.importFingerprint,
        })
        .run();
      if (!item.update) {
        tx.update(table).set({ importFingerprint: item.fingerprint }).where(eq(table.id, entry.id)).run();
        continue;
      }
      const change = {
        amountCents: item.amountCents,
        occurredOn: item.occurredOn,
        categoryId: entry.categoryId,
        assetId: entry.assetId,
        note: entry.note,
      };
      try {
        if (item.kind === "expense") updateExpenseTx(tx, entry.id, change, { importFingerprint: item.fingerprint });
        else updateIncomeTx(tx, entry.id, change, { importFingerprint: item.fingerprint });
      } catch (error) {
        invalid(error instanceof Error ? error.message : "The posted entry could not be updated.", item.position);
      }
      updatedCount += 1;
    }

    const ordered = [...input.rows].sort(
      (a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.position - b.position,
    );
    let unlinkedCount = 0;
    for (const row of ordered) {
      let assetId: number | null = null;
      if (linkMode === "per_row" && input.assetId !== null) {
        const latest = latestAssetSnapshot(tx, input.assetId);
        if (latest !== null && row.occurredOn < latest.recordedOn) unlinkedCount += 1;
        else assetId = input.assetId;
      }
      const journal = {
        amountCents: row.amountCents,
        occurredOn: row.occurredOn,
        categoryId: row.categoryId,
        assetId,
        note: row.note.trim() || null,
      };
      const links = { importBatchId: batch.id, importFingerprint: row.fingerprint };
      try {
        if (row.kind === "expense") insertExpense(tx, journal, links);
        else insertIncome(tx, journal, links);
      } catch (error) {
        invalid(error instanceof Error ? error.message : "This row could not be saved.", row.position);
      }
    }

    let closing: ConfirmImportResult["closing"] = "none";
    if (
      linkMode === "closing" &&
      input.assetId !== null &&
      input.closingBalanceCents !== null &&
      input.closingBalanceCents >= 0 &&
      input.periodTo !== null
    ) {
      const latest = latestAssetSnapshot(tx, input.assetId);
      if (latest !== null && latest.recordedOn >= input.periodTo) {
        closing = "skipped";
      } else {
        const snapshot = tx
          .insert(valueSnapshots)
          .values({
            assetId: input.assetId,
            liabilityId: null,
            recordedOn: input.periodTo,
            amountCents: input.closingBalanceCents,
            note: "Statement closing balance",
            createdAt: new Date().toISOString(),
          })
          .returning()
          .get();
        tx.update(importBatches)
          .set({ closingSnapshotId: snapshot.id })
          .where(eq(importBatches.id, batch.id))
          .run();
        closing = "written";
      }
    }

    return {
      batch: tx.select().from(importBatches).where(eq(importBatches.id, batch.id)).get()!,
      updatedCount,
      unlinkedCount,
      closing,
    };
  });
}

/**
 * Removes a batch's rows (newest first, reversing their cash links), its closing
 * snapshot and the batch itself. Refused as a whole if a linked row is frozen.
 */
export function undoImport(batchId: number): UndoImportResult {
  const batch = db.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
  if (!batch) return { ok: false, error: "Import not found." };

  try {
    const removed = db.transaction((tx) => {
      const rows = [
        ...tx.select().from(expenses).where(eq(expenses.importBatchId, batchId)).all()
          .map((row) => ({ ...row, table: expenses })),
        ...tx.select().from(incomes).where(eq(incomes.importBatchId, batchId)).all()
          .map((row) => ({ ...row, table: incomes })),
      ].sort(
        (a, b) =>
          b.occurredOn.localeCompare(a.occurredOn) ||
          (b.linkedSnapshotId ?? 0) - (a.linkedSnapshotId ?? 0) ||
          b.id - a.id,
      );

      for (const row of rows) {
        if (row.linkedSnapshotId !== null && row.assetId !== null) {
          const latest = latestAssetSnapshot(tx, row.assetId);
          if (latest === null || latest.id !== row.linkedSnapshotId) {
            invalid(
              `An imported entry from ${row.occurredOn} is linked to a cash balance that has a newer balance${latest ? ` on ${latest.recordedOn}` : ""}. Unlink it in Activity, or delete the newer balance, then undo again.`,
            );
          }
        }
        deleteCashLink(tx, row);
        tx.delete(row.table).where(eq(row.table.id, row.id)).run();
      }

      // Restore entries this import updated, newest record first, after its own rows are gone.
      const updates = tx
        .select()
        .from(importBatchUpdates)
        .where(eq(importBatchUpdates.batchId, batchId))
        .orderBy(desc(importBatchUpdates.id))
        .all();
      for (const update of updates) {
        const table = update.kind === "expense" ? expenses : incomes;
        const entry = tx.select().from(table).where(eq(table.id, update.entryId)).get();
        if (!entry) continue;
        const previous = {
          amountCents: update.previousAmountCents,
          occurredOn: update.previousOccurredOn,
          categoryId: entry.categoryId,
          assetId: entry.assetId,
          note: entry.note,
        };
        const links = update.previousFingerprint === null
          ? { clearFingerprint: true }
          : { importFingerprint: update.previousFingerprint };
        if (update.kind === "expense") updateExpenseTx(tx, entry.id, previous, links);
        else updateIncomeTx(tx, entry.id, previous, links);
      }

      if (batch.closingSnapshotId !== null) {
        const referenced =
          tx.select({ id: expenses.id }).from(expenses)
            .where(eq(expenses.linkedSnapshotId, batch.closingSnapshotId)).get() ??
          tx.select({ id: incomes.id }).from(incomes)
            .where(eq(incomes.linkedSnapshotId, batch.closingSnapshotId)).get();
        if (!referenced) {
          tx.delete(valueSnapshots).where(eq(valueSnapshots.id, batch.closingSnapshotId)).run();
        }
      }

      tx.delete(importBatches).where(eq(importBatches.id, batchId)).run();
      return rows.length;
    });
    return { ok: true, removed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not undo the import." };
  }
}

/** Matched entries whose cash link has a newer balance, so amount and date can't change. */
export function frozenEntryKeys(items: ReadonlyArray<{ kind: ImportKind; entryId: number }>): Set<string> {
  const frozen = new Set<string>();
  for (const item of items) {
    const table = item.kind === "expense" ? expenses : incomes;
    const entry = db.select().from(table).where(eq(table.id, item.entryId)).get();
    if (!entry || entry.linkedSnapshotId === null || entry.assetId === null) continue;
    const latest = selectLatestSnapshot(
      db.select().from(valueSnapshots).where(eq(valueSnapshots.assetId, entry.assetId)).all(),
    );
    if (latest?.id !== entry.linkedSnapshotId) frozen.add(`${item.kind}:${item.entryId}`);
  }
  return frozen;
}
