/** POST /v1/completions — legacy text completions, mock. */

import { mockAssistantReply } from "./mock-data";
import {
  approxTokens,
  errorResponse,
  json,
  makeUsage,
  nowSeconds,
  randomId,
  sseResponse,
  splitForStreaming,
} from "./util";

interface CompletionsRequest {
  model?: string;
  prompt?: string | number[] | Array<string | number[]>;
  stream?: boolean;
  n?: number;
}

function normalizePrompts(prompt: CompletionsRequest["prompt"]): string[] | null {
  if (typeof prompt === "string") return [prompt];
  if (Array.isArray(prompt) && prompt.length > 0) {
    return prompt.map((entry) =>
      typeof entry === "string" ? entry : Array.isArray(entry) ? entry.join(" ") : String(entry),
    );
  }
  return null;
}

export async function handleCompletions(request: Request): Promise<Response> {
  let body: CompletionsRequest;
  try {
    body = (await request.json()) as CompletionsRequest;
  } catch {
    return errorResponse(400, "We could not parse the JSON body of your request.");
  }
  const prompts = normalizePrompts(body.prompt);
  if (!prompts) {
    return errorResponse(
      400,
      "you must provide a prompt parameter",
      "invalid_request_error",
      null,
      "prompt",
    );
  }

  const model = body.model ?? "gpt-3.5-turbo-instruct";
  const envelope = {
    id: randomId("cmpl-"),
    created: nowSeconds(),
    model,
    system_fingerprint: "fp_mock_worker",
  };
  const reply = mockAssistantReply(prompts[0] ?? "");
  const usage = makeUsage(approxTokens(JSON.stringify(prompts)), approxTokens(reply));

  if (body.stream) {
    return sseResponse(async (emit) => {
      const chunk = (text: string, finish_reason: string | null) => ({
        ...envelope,
        object: "text_completion",
        choices: [{ text, index: 0, logprobs: null, finish_reason }],
      });
      for (const piece of splitForStreaming(reply)) {
        await emit(chunk(piece, null));
      }
      await emit(chunk("", "stop"));
    });
  }

  const n = Math.max(1, Math.min(body.n ?? 1, 4));
  return json({
    ...envelope,
    object: "text_completion",
    choices: Array.from({ length: n }, (_, index) => ({
      text: reply,
      index,
      logprobs: null,
      finish_reason: "stop",
    })),
    usage,
  });
}
