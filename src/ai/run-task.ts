import type { ZodType } from "zod";
import type { AiResultStore } from "@/db/repositories/ai-results";
import { completeJson, readAiConfig } from "./client";
import { hashInput } from "./hash";
import { AI_SYSTEM_PROMPT } from "./prompts/system";

export type TaskSource = "ai" | "cache" | "fallback";

export type TaskDeps = {
  store?: AiResultStore;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
};

export type TaskResult<T> = {
  output: T;
  source: TaskSource;
  refusalReason?: string;
};

type ModelObject = {
  refused?: boolean;
  reason?: string;
};

async function resolveStore(store?: AiResultStore): Promise<AiResultStore> {
  if (store) return store;
  const repo = await import("@/db/repositories/ai-results");
  return repo.aiResultStore;
}

export async function runAiTask<T extends ModelObject>(options: {
  task: string;
  entityId: string | null;
  promptVersion: string;
  instructions: string;
  schemaName: string;
  jsonSchema: object;
  zodSchema: ZodType<T>;
  input: unknown;
  fallback: () => T;
  accept?: (value: T) => boolean;
  deps?: TaskDeps;
}): Promise<TaskResult<T>> {
  const store = await resolveStore(options.deps?.store);
  const inputHash = hashInput(options.input);
  const cached = store.find(options.task, options.entityId, inputHash);
  if (cached && cached.promptVersion === options.promptVersion) {
    let cachedJson: unknown;
    try {
      cachedJson = JSON.parse(cached.outputJson) as unknown;
    } catch {
      cachedJson = null;
    }
    const parsed = options.zodSchema.safeParse(cachedJson);
    if (
      parsed.success &&
      !parsed.data.refused &&
      (options.accept?.(parsed.data) ?? true)
    ) {
      return { output: parsed.data, source: "cache" };
    }
  }

  const useFallback = (refusalReason?: string): TaskResult<T> => ({
    output: options.fallback(),
    source: "fallback",
    refusalReason,
  });

  const config = readAiConfig(options.deps?.env ?? process.env);
  if (!config) return useFallback();

  const completed = await completeJson({
    config,
    system: `${AI_SYSTEM_PROMPT}\n${options.instructions}`,
    user: JSON.stringify(options.input),
    schemaName: options.schemaName,
    schema: options.jsonSchema as Record<string, unknown>,
    fetchImpl: options.deps?.fetchImpl,
    timeoutMs: options.deps?.timeoutMs,
  });
  if (!completed.ok) return useFallback();

  const parsed = options.zodSchema.safeParse(completed.value);
  if (!parsed.success) return useFallback();
  if (parsed.data.refused) return useFallback(parsed.data.reason);
  if (options.accept && !options.accept(parsed.data)) return useFallback();

  try {
    store.save({
      task: options.task,
      entityId: options.entityId,
      inputHash,
      promptVersion: options.promptVersion,
      outputJson: JSON.stringify(parsed.data),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const message = error instanceof Error ? error.message : "cache save failed";
      console.info(`ai cache save failed: ${message}`);
    }
  }

  return { output: parsed.data, source: "ai" };
}
