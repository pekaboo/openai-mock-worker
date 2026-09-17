/** Static mock data and deterministic mock-content generators. */

export interface MockModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

const CREATED = 1715367049;

export const MODELS: MockModel[] = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "o3",
  "o4-mini",
  "text-embedding-3-small",
  "text-embedding-3-large",
].map((id) => ({
  id,
  object: "model" as const,
  created: CREATED,
  owned_by: id.startsWith("text-embedding") ? "openai" : "system",
}));

/** Deterministic markdown reply that echoes the last user message. */
export function mockAssistantReply(question: string): string {
  const q = question.trim().slice(0, 120) || "(empty message)";
  return [
    `You said: "${q}".`,
    "",
    "This is a **mocked** completion from `openai-mock-worker` — no real model was called.",
    "",
    "What this reply demonstrates:",
    "1. Multi-line markdown output",
    "2. Simulated streaming over SSE",
    "3. Token `usage` accounting",
    "",
    "Point any OpenAI SDK at this server's `/v1` endpoint to exercise your integration end to end.",
  ].join("\n");
}

/**
 * Build mock arguments for the first requested tool by filling in its JSON
 * Schema `properties` with plausible values derived from the property names.
 */
export function mockToolArguments(parameters: unknown, question: string): string {
  const properties = (parameters as { properties?: Record<string, { type?: string }> } | null | undefined)
    ?.properties;
  if (!properties || Object.keys(properties).length === 0) return "{}";

  const args: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(properties)) {
    switch (schema?.type) {
      case "integer":
      case "number":
        args[name] = 1;
        break;
      case "boolean":
        args[name] = true;
        break;
      case "array":
        args[name] = [question.slice(0, 40) || "mock-item"];
        break;
      case "object":
        args[name] = {};
        break;
      default:
        args[name] = /city|location|place|query|search|q\b/i.test(name)
          ? question.slice(0, 60) || "mock-value"
          : `mock-${name}`;
    }
  }
  return JSON.stringify(args);
}
