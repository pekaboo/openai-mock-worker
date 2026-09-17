/** POST /v1/embeddings — deterministic mock vectors (same input → same vector). */

import { approxTokens, errorResponse, json, nowSeconds } from "./util";

interface EmbeddingsRequest {
  model?: string;
  input?: string | number[] | Array<string | number[]>;
  dimensions?: number;
}

/** FNV-1a string hash → 32-bit seed. */
function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG (mulberry32) so vectors are stable across calls. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mockEmbedding(text: string, dimensions: number): number[] {
  const random = mulberry32(fnv1a(text));
  const raw = Array.from({ length: dimensions }, () => random() * 2 - 1);
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0)) || 1;
  return raw.map((value) => value / norm);
}

function normalizeInputs(input: EmbeddingsRequest["input"]): string[] | null {
  if (typeof input === "string") return [input];
  if (Array.isArray(input) && input.length > 0) {
    return input.map((entry) =>
      typeof entry === "string" ? entry : Array.isArray(entry) ? entry.join(" ") : String(entry),
    );
  }
  return null;
}

export async function handleEmbeddings(request: Request): Promise<Response> {
  let body: EmbeddingsRequest;
  try {
    body = (await request.json()) as EmbeddingsRequest;
  } catch {
    return errorResponse(400, "We could not parse the JSON body of your request.");
  }
  const inputs = normalizeInputs(body.input);
  if (!inputs) {
    return errorResponse(
      400,
      "you must provide an input parameter",
      "invalid_request_error",
      null,
      "input",
    );
  }

  const model = body.model ?? "text-embedding-3-small";
  const maxDimensions = model.includes("large") ? 3072 : 1536;
  const dimensions = Math.max(1, Math.min(body.dimensions ?? maxDimensions, maxDimensions));
  const promptTokens = inputs.reduce((sum, text) => sum + approxTokens(text), 0);

  return json({
    object: "list",
    data: inputs.map((text, index) => ({
      object: "embedding",
      index,
      embedding: mockEmbedding(text, dimensions),
    })),
    model,
    created: nowSeconds(),
    usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
  });
}
