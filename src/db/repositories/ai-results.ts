import { and, eq, isNull } from "drizzle-orm";
import { db } from "../client";
import { aiResults, type AiResultRow } from "../schema";

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
    const existing = aiResultStore.find(row.task, row.entityId, row.inputHash);
    if (existing) return;
    db.insert(aiResults)
      .values({
        task: row.task,
        entityId: row.entityId,
        inputHash: row.inputHash,
        promptVersion: row.promptVersion,
        outputJson: row.outputJson,
        createdAt: new Date().toISOString(),
      })
      .run();
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
