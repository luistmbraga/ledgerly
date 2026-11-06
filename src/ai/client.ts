export type AiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type Env = Record<string, string | undefined>;

export function readAiConfig(env: Env = process.env): AiConfig | null {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (env.AI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
    /\/+$/,
    "",
  );
  const model = env.AI_MODEL?.trim() || "gpt-4o-mini";
  return { apiKey, baseUrl, model };
}

export type CompleteJsonInput = {
  config: AiConfig;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type CompleteJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

async function requestOnce(
  input: CompleteJsonInput,
  timeoutMs: number,
): Promise<unknown> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${input.config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.config.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: false,
          schema: input.schema,
        },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Missing message content");
  }
  return JSON.parse(content) as unknown;
}

/** One POST, then a single retry. Does not log response bodies. */
export async function completeJson(
  input: CompleteJsonInput,
): Promise<CompleteJsonResult> {
  const timeoutMs = input.timeoutMs ?? 20_000;
  try {
    return { ok: true, value: await requestOnce(input, timeoutMs) };
  } catch (first) {
    if (process.env.NODE_ENV !== "production") {
      const message = first instanceof Error ? first.message : "request failed";
      console.info(`ai request failed, retrying once: ${message}`);
    }
    try {
      return { ok: true, value: await requestOnce(input, timeoutMs) };
    } catch (second) {
      const message = second instanceof Error ? second.message : "request failed";
      if (process.env.NODE_ENV !== "production") {
        console.info(`ai request failed after retry: ${message}`);
      }
      return { ok: false, error: message };
    }
  }
}
