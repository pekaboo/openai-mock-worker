/** Static mock data and mock-content generators. */

import { REPLIES } from "./replies";

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

/** Pick one of the 50 canned replies at random, splicing in the question. */
export function mockAssistantReply(question: string): string {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const template = REPLIES[random[0] % REPLIES.length];
  return template.replaceAll("{question}", question.trim().slice(0, 120) || "(empty message)");
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
