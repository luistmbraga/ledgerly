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
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type CompleteJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; status?: number; retryable?: boolean };

function isRetryableFailure(error: unknown, status?: number): boolean {
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }
  if (error instanceof Error) {
    const name = error.name;
    if (name === "TimeoutError" || name === "AbortError") return true;
    if (/timeout|aborted|network/i.test(error.message)) return true;
  }
  return false;
}

async function requestOnce(
  input: CompleteJsonInput,
  timeoutMs: number,
): Promise<{ value: unknown; status: number }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${input.config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.config.model,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 800,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    (err as Error & { status: number }).status = response.status;
    throw err;
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Missing message content");
  }
  return { value: JSON.parse(content) as unknown, status: response.status };
}

/** One POST; retries only timeouts, 429, and 5xx. Does not log response bodies. */
export async function completeJson(
  input: CompleteJsonInput,
): Promise<CompleteJsonResult> {
  const timeoutMs = input.timeoutMs ?? 20_000;
  try {
    const first = await requestOnce(input, timeoutMs);
    return { ok: true, value: first.value };
  } catch (first) {
    const status =
      first instanceof Error && "status" in first
        ? (first as Error & { status?: number }).status
        : undefined;
    if (process.env.NODE_ENV !== "production") {
      const message = first instanceof Error ? first.message : "request failed";
      console.info(`ai request failed: ${message}`);
    }
    if (!isRetryableFailure(first, status)) {
      return {
        ok: false,
        error: first instanceof Error ? first.message : "request failed",
        status,
        retryable: false,
      };
    }
    if (process.env.NODE_ENV !== "production") {
      console.info("ai request retrying once");
    }
    try {
      const second = await requestOnce(input, timeoutMs);
      return { ok: true, value: second.value };
    } catch (second) {
      const secondStatus =
        second instanceof Error && "status" in second
          ? (second as Error & { status?: number }).status
          : undefined;
      const message =
        second instanceof Error ? second.message : "request failed";
      if (process.env.NODE_ENV !== "production") {
        console.info(`ai request failed after retry: ${message}`);
      }
      return {
        ok: false,
        error: message,
        status: secondStatus,
        retryable: true,
      };
    }
  }
}
