import { z } from "zod";

const refusedFields = {
  refused: z.boolean().optional(),
  reason: z.string().max(200).optional(),
};

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
  required: ["categoryId", "confidence", "rationale"],
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
  required: ["tips"],
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
  required: ["summary", "steps"],
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
  required: ["headline", "sections", "disclaimer"],
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
