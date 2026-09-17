/** Shared helpers: CORS, JSON/SSE responses, OpenAI-style errors, ids, token estimates. */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, OpenAI-Organization",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function errorResponse(
  status: number,
  message: string,
  type = "invalid_request_error",
  code: string | null = null,
  param: string | null = null,
): Response {
  return json({ error: { message, type, param, code } }, status);
}

const SSE_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
};

const SSE_DONE = "data: [DONE]\n\n";

/** Delay between streamed chunks so clients can observe progressive rendering. */
const CHUNK_DELAY_MS = 15;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build an SSE `Response` from a generator. Every payload passed to `emit`
 * becomes one `data: {...}` frame (with a small pacing delay); the `[DONE]`
 * sentinel is always sent last, even if the generator throws mid-stream.
 */
export function sseResponse(
  generate: (emit: (payload: unknown) => Promise<void>) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = async (payload: unknown): Promise<void> => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        await sleep(CHUNK_DELAY_MS);
      };
      try {
        await generate(emit);
      } finally {
        controller.enqueue(encoder.encode(SSE_DONE));
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/** Split text into word-sized pieces (keeping whitespace) for streaming chunks. */
export function splitForStreaming(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

/** OpenAI-style prefixed id, e.g. `chatcmpl-a1b2...`. */
export function randomId(prefix: string, length = 24): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, length);
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Rough token estimate (~4 chars per token) for the usage fields. */
export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Usage block shared by chat/completions responses. */
export function makeUsage(promptTokens: number, completionTokens: number) {
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
    completion_tokens_details: {
      reasoning_tokens: 0,
      audio_tokens: 0,
      accepted_prediction_tokens: 0,
      rejected_prediction_tokens: 0,
    },
  };
}
