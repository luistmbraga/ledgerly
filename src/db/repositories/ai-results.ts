import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "../client";
import { aiResults, type AiResultRow } from "../schema";

const EVICT_DAYS = 30;
const DAILY_AI_LIMIT = 20;

export type StoredAiResult = {
  task: string;
  entityId: string | null;
  inputHash: string;
  promptVersion: string;
  outputJson: string;
};

export type AiResultStore = {
  find(
    task: string,
    entityId: string | null,
    inputHash: string,
  ): StoredAiResult | null;
  save(row: StoredAiResult): void;
};

function fromRow(row: AiResultRow): StoredAiResult {
  return {
    task: row.task,
    entityId: row.entityId,
    inputHash: row.inputHash,
    promptVersion: row.promptVersion,
    outputJson: row.outputJson,
  };
}

function evictOldRows(): void {
  const cutoff = new Date(Date.now() - EVICT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.delete(aiResults).where(lt(aiResults.createdAt, cutoff)).run();
}

export function countTodayRows(): number {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(aiResults)
    .where(and(sql`${aiResults.createdAt} >= ${today}`, sql`${aiResults.createdAt} < ${tomorrow}`))
    .get();
  return row?.n ?? 0;
}

export { DAILY_AI_LIMIT };

export const aiResultStore: AiResultStore = {
  find(task, entityId, inputHash) {
    const row = db
      .select()
      .from(aiResults)
      .where(
        and(
          eq(aiResults.task, task),
          entityId === null
            ? isNull(aiResults.entityId)
            : eq(aiResults.entityId, entityId),
          eq(aiResults.inputHash, inputHash),
        ),
      )
      .get();
    return row ? fromRow(row) : null;
  },
  save(row) {
    const now = new Date().toISOString();
    db.insert(aiResults)
      .values({
        task: row.task,
        entityId: row.entityId,
        inputHash: row.inputHash,
        promptVersion: row.promptVersion,
        outputJson: row.outputJson,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [aiResults.task, aiResults.entityId, aiResults.inputHash],
        set: { promptVersion: row.promptVersion, outputJson: row.outputJson },
      })
      .run();
    evictOldRows();
  },
};

export function memoryAiResultStore(): AiResultStore {
  const rows: StoredAiResult[] = [];
  return {
    find(task, entityId, inputHash) {
      return (
        rows.find(
          (row) =>
            row.task === task &&
            row.entityId === entityId &&
            row.inputHash === inputHash,
        ) ?? null
      );
    },
    save(row) {
      const existing = rows.some(
        (item) =>
          item.task === row.task &&
          item.entityId === row.entityId &&
          item.inputHash === row.inputHash,
      );
      if (!existing) rows.push(row);
    },
  };
}
