import { z } from "zod";

const refusedFields = {
  refused: z.boolean().optional(),
  reason: z.string().max(200).optional(),
};

export const entryParseSchema = z.object({
  kind: z.enum(["expense", "income"]),
  amountRaw: z.string().max(30),
  occurredOn: z.string().max(10),
  categoryId: z.number().int().nullable(),
  note: z.string().max(100),
  ...refusedFields,
});

export const entryParseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "amountRaw", "occurredOn", "categoryId", "note", "refused", "reason"],
  properties: {
    kind: { type: "string", enum: ["expense", "income"] },
    amountRaw: { type: "string", maxLength: 30 },
    occurredOn: { type: "string", maxLength: 10 },
    categoryId: { type: ["integer", "null"] },
    note: { type: "string", maxLength: 100 },
    refused: { type: "boolean" },
    reason: { type: "string", maxLength: 200 },
  },
} as const;

export const categorySuggestSchema = z.object({
  categoryId: z.number().int().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string().max(200),
  ...refusedFields,
});

export const tipsSchema = z.object({
  tips: z
    .array(
      z.object({
        findingId: z.string(),
        title: z.string().max(80),
        body: z.string().max(400),
      }),
    )
    .max(6),
  ...refusedFields,
});

export const goalExplainSchema = z.object({
  summary: z.string().max(500),
  steps: z.array(z.string().max(200)).max(5),
  ...refusedFields,
});

export const briefingSchema = z.object({
  headline: z.string().max(120),
  sections: z
    .array(
      z.object({
        heading: z.string().max(60),
        body: z.string().max(600),
      }),
    )
    .max(5),
  disclaimer: z.string().max(300),
  ...refusedFields,
});

export const categorySuggestJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["categoryId", "confidence", "rationale", "refused", "reason"],
  properties: {
    categoryId: { type: ["integer", "null"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    rationale: { type: "string", maxLength: 200 },
    refused: { type: "boolean" },
    reason: { type: "string", maxLength: 200 },
  },
} as const;

export const tipsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tips", "refused", "reason"],
  properties: {
    tips: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["findingId", "title", "body"],
        properties: {
          findingId: { type: "string" },
          title: { type: "string", maxLength: 80 },
          body: { type: "string", maxLength: 400 },
        },
      },
    },
    refused: { type: "boolean" },
    reason: { type: "string", maxLength: 200 },
  },
} as const;

export const goalExplainJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "steps", "refused", "reason"],
  properties: {
    summary: { type: "string", maxLength: 500 },
    steps: {
      type: "array",
      maxItems: 5,
      items: { type: "string", maxLength: 200 },
    },
    refused: { type: "boolean" },
    reason: { type: "string", maxLength: 200 },
  },
} as const;

export const briefingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "sections", "disclaimer", "refused", "reason"],
  properties: {
    headline: { type: "string", maxLength: 120 },
    sections: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: {
          heading: { type: "string", maxLength: 60 },
          body: { type: "string", maxLength: 600 },
        },
      },
    },
    disclaimer: { type: "string", maxLength: 300 },
    refused: { type: "boolean" },
    reason: { type: "string", maxLength: 200 },
  },
} as const;

type JsonSchemaNode = Record<string, unknown>;

/** Rewrite a JSON Schema for OpenAI strict mode (strip maxLength/maxItems, fix nullables). */
export function toStrictSchema(schema: object): Record<string, unknown> {
  return rewriteNode(structuredClone(schema) as JsonSchemaNode);
}

function rewriteNode(node: JsonSchemaNode): JsonSchemaNode {
  const next: JsonSchemaNode = { ...node };
  delete next.maxLength;
  delete next.maxItems;
  delete next.minLength;
  delete next.minItems;

  if (Array.isArray(next.type) && next.type.includes("null")) {
    const nonNull = (next.type as string[]).filter((t) => t !== "null");
    const { type: _type, ...rest } = next;
    if (nonNull.length === 1) {
      return {
        anyOf: [{ type: nonNull[0], ...rest }, { type: "null" }],
      };
    }
  }

  if (next.properties && typeof next.properties === "object") {
    const props = next.properties as Record<string, JsonSchemaNode>;
    const rewritten: Record<string, JsonSchemaNode> = {};
    for (const [key, value] of Object.entries(props)) {
      rewritten[key] = rewriteNode(value);
    }
    next.properties = rewritten;
    next.additionalProperties = false;
    if (!Array.isArray(next.required)) {
      next.required = Object.keys(rewritten);
    }
  }

  if (next.items && typeof next.items === "object") {
    next.items = rewriteNode(next.items as JsonSchemaNode);
  }

  if (Array.isArray(next.anyOf)) {
    next.anyOf = (next.anyOf as JsonSchemaNode[]).map(rewriteNode);
  }

  return next;
}

/** Per-request schema; `runAiTask` applies `toStrictSchema`. */
export function categorySuggestSchemaForIds(
  categoryIds: readonly number[],
): Record<string, unknown> {
  const base = structuredClone(categorySuggestJsonSchema) as JsonSchemaNode;
  const props = base.properties as Record<string, JsonSchemaNode>;
  props.categoryId =
    categoryIds.length === 0
      ? { type: "null" }
      : {
          anyOf: [
            { type: "integer", enum: [...categoryIds] },
            { type: "null" },
          ],
        };
  return base;
}

/** Per-request schema; `runAiTask` applies `toStrictSchema`. */
export function entryParseSchemaForCategoryIds(
  categoryIds: readonly number[],
): Record<string, unknown> {
  const base = structuredClone(entryParseJsonSchema) as JsonSchemaNode;
  const props = base.properties as Record<string, JsonSchemaNode>;
  props.categoryId =
    categoryIds.length === 0
      ? { type: "null" }
      : {
          anyOf: [
            { type: "integer", enum: [...categoryIds] },
            { type: "null" },
          ],
        };
  return base;
}

/** Per-request schema; `runAiTask` applies `toStrictSchema`. */
export function tipsSchemaForFindingIds(
  findingIds: readonly string[],
): Record<string, unknown> {
  const base = structuredClone(tipsJsonSchema) as JsonSchemaNode;
  const tips = (base.properties as Record<string, JsonSchemaNode>)
    .tips as JsonSchemaNode;
  const items = tips.items as JsonSchemaNode;
  const props = items.properties as Record<string, JsonSchemaNode>;
  if (findingIds.length > 0) {
    props.findingId = { type: "string", enum: [...findingIds] };
  }
  return base;
}
