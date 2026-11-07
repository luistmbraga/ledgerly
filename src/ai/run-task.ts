import type { ZodType } from "zod";
import type { AiResultStore } from "@/db/repositories/ai-results";
import { completeJson, readAiConfig } from "./client";
import { hashInput } from "./hash";
import { AI_SYSTEM_PROMPT } from "./prompts/system";
import { toStrictSchema } from "./schemas";

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

export type AcceptResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

async function resolveStore(store?: AiResultStore): Promise<AiResultStore> {
  if (store) return store;
  const repo = await import("@/db/repositories/ai-results");
  return repo.aiResultStore;
}

function evaluateAccept<T>(
  value: T,
  accept?: (value: T) => boolean | AcceptResult<T>,
): AcceptResult<T> {
  if (!accept) return { ok: true, value };
  const result = accept(value);
  if (typeof result === "boolean") {
    return result
      ? { ok: true, value }
      : { ok: false, reason: "accept rejected" };
  }
  return result;
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
  accept?: (value: T) => boolean | AcceptResult<T>;
  /** When true, one repair call is attempted after schema or accept failure. */
  repair?: boolean;
  temperature?: number;
  maxTokens?: number;
  deps?: TaskDeps;
}): Promise<TaskResult<T>> {
  const store = await resolveStore(options.deps?.store);
  const config = readAiConfig(options.deps?.env ?? process.env);
  const inputHash = hashInput({
    input: options.input,
    model: config?.model ?? null,
  });
  const cached = store.find(options.task, options.entityId, inputHash);
  if (cached && cached.promptVersion === options.promptVersion) {
    let cachedJson: unknown;
    try {
      cachedJson = JSON.parse(cached.outputJson) as unknown;
    } catch {
      cachedJson = null;
    }
    const parsed = options.zodSchema.safeParse(cachedJson);
    if (parsed.success && !parsed.data.refused) {
      const accepted = evaluateAccept(parsed.data, options.accept);
      if (accepted.ok) {
        return { output: accepted.value, source: "cache" };
      }
    }
  }

  const makeFallback = (refusalReason?: string): TaskResult<T> => ({
    output: options.fallback(),
    source: "fallback",
    refusalReason,
  });

  if (!config) return makeFallback();

  const system = `${AI_SYSTEM_PROMPT}\n${options.instructions}`;
  const schema = toStrictSchema(options.jsonSchema);
  const callOnce = async (user: string) =>
    completeJson({
      config,
      system,
      user,
      schemaName: options.schemaName,
      schema,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      fetchImpl: options.deps?.fetchImpl,
      timeoutMs: options.deps?.timeoutMs,
    });

  type Attempt =
    | { kind: "refused"; reason?: string }
    | { kind: "reject"; reason: string; raw: unknown }
    | { kind: "ok"; value: T };

  const attempt = (raw: unknown): Attempt => {
    const parsed = options.zodSchema.safeParse(raw);
    if (!parsed.success) {
      return { kind: "reject", reason: parsed.error.message, raw };
    }
    if (parsed.data.refused) {
      return { kind: "refused", reason: parsed.data.reason };
    }
    const accepted = evaluateAccept(parsed.data, options.accept);
    if (!accepted.ok) {
      return { kind: "reject", reason: accepted.reason, raw };
    }
    return { kind: "ok", value: accepted.value };
  };

  const first = await callOnce(JSON.stringify(options.input));
  if (!first.ok) return makeFallback();

  let result = attempt(first.value);
  if (result.kind === "refused") {
    return makeFallback(result.reason);
  }

  if (result.kind === "reject" && options.repair) {
    const repairUser = JSON.stringify({
      previousInput: options.input,
      previousOutput: result.raw,
      error: result.reason,
      instruction:
        "Fix the previousOutput so it matches the schema and rules. Quote display strings from previousInput only.",
    });
    const repaired = await callOnce(repairUser);
    if (repaired.ok) {
      result = attempt(repaired.value);
      if (result.kind === "refused") {
        return makeFallback(result.reason);
      }
    }
  }

  if (result.kind !== "ok") return makeFallback();

  try {
    store.save({
      task: options.task,
      entityId: options.entityId,
      inputHash,
      promptVersion: options.promptVersion,
      outputJson: JSON.stringify(result.value),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const message = error instanceof Error ? error.message : "cache save failed";
      console.info(`ai cache save failed: ${message}`);
    }
  }

  return { output: result.value, source: "ai" };
}
