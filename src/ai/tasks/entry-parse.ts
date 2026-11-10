import { ENTRY_PARSE_INSTRUCTIONS, ENTRY_PARSE_VERSION } from "../prompts/entry-parse";
import { runAiTask, type TaskDeps, type TaskResult } from "../run-task";
import { entryParseSchema, entryParseSchemaForCategoryIds } from "../schemas";

export type EntryParseRequest = {
  text: string;
  asOfDate: string;
  categories: { id: number; name: string; kind: "expense" | "income" }[];
};

export type EntryParseOutput = {
  kind: "expense" | "income";
  amountRaw: string;
  occurredOn: string;
  categoryId: number | null;
  note: string;
  refused?: boolean;
  reason?: string;
};

function entryParseFallback(): EntryParseOutput {
  return {
    kind: "expense",
    amountRaw: "",
    occurredOn: "",
    categoryId: null,
    note: "",
    refused: true,
    reason: "Could not parse without AI.",
  };
}

export async function parseEntry(
  request: EntryParseRequest,
  deps?: TaskDeps,
): Promise<TaskResult<EntryParseOutput>> {
  const input = {
    task: "entry_parse" as const,
    promptVersion: ENTRY_PARSE_VERSION,
    asOfDate: request.asOfDate,
    text: request.text.slice(0, 500),
    categories: request.categories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
    })),
  };

  const allowedIds = new Set(request.categories.map((c) => c.id));

  return runAiTask({
    task: "entry_parse",
    entityId: null,
    promptVersion: ENTRY_PARSE_VERSION,
    instructions: ENTRY_PARSE_INSTRUCTIONS,
    schemaName: "entry_parse",
    jsonSchema: entryParseSchemaForCategoryIds(request.categories.map((c) => c.id)),
    zodSchema: entryParseSchema,
    input,
    deps,
    temperature: 0,
    maxTokens: 200,
    fallback: entryParseFallback,
    accept: (value) => {
      if (value.categoryId !== null && !allowedIds.has(value.categoryId)) {
        return false;
      }
      return true;
    },
  });
}
