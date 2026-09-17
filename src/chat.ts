/** POST /v1/chat/completions — mock, supports stream / tools / n / usage. */

import { mockAssistantReply, mockToolArguments } from "./mock-data";
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

interface ContentPart {
  type: string;
  text?: string;
}

interface ChatMessage {
  role: string;
  content: string | ContentPart[] | null;
}

interface FunctionTool {
  type: "function";
  function: { name: string; parameters?: unknown };
}

interface ChatRequest {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  n?: number;
  tools?: FunctionTool[];
  tool_choice?: string | { type: string } | null;
  stream_options?: { include_usage?: boolean };
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    const content = messages[i].content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join(" ");
    }
    return "";
  }
  return "";
}

export async function handleChatCompletions(request: Request): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return errorResponse(400, "We could not parse the JSON body of your request.");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return errorResponse(
      400,
      "you must provide a messages parameter",
      "invalid_request_error",
      null,
      "messages",
    );
  }

  const model = body.model ?? "gpt-4o-mini";
  const id = randomId("chatcmpl-");
  const created = nowSeconds();
  const systemFingerprint = "fp_mock_worker";
  const question = lastUserText(body.messages);
  const promptTokens = approxTokens(JSON.stringify(body.messages));
  const useTool = Array.isArray(body.tools) && body.tools.length > 0 && body.tool_choice !== "none";
  const includeUsage = body.stream_options?.include_usage === true;

  // Shared envelope fields for both full responses and stream chunks.
  const envelope = { id, created, model, system_fingerprint: systemFingerprint };

  let completionText: string;
  if (useTool) {
    const tool = body.tools![0];
    completionText = mockToolArguments(tool.function.parameters, question);
    const toolCall = {
      id: randomId("call_", 24),
      type: "function" as const,
      function: { name: tool.function.name, arguments: completionText },
    };

    if (body.stream) {
      return sseResponse(async (emit) => {
        const chunk = (delta: unknown, finish_reason: string | null) => ({
          ...envelope,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta, logprobs: null, finish_reason }],
        });
        await emit(chunk({ role: "assistant", content: null, tool_calls: [{ index: 0, ...toolCall, function: { name: toolCall.function.name, arguments: "" } }] }, null));
        await emit(chunk({ tool_calls: [{ index: 0, function: { arguments: completionText } }] }, null));
        await emit(chunk({}, "tool_calls"));
        if (includeUsage) {
          await emit({ ...envelope, object: "chat.completion.chunk", choices: [], usage: makeUsage(promptTokens, approxTokens(completionText)) });
        }
      });
    }

    return json({
      ...envelope,
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: null, tool_calls: [toolCall] },
          logprobs: null,
          finish_reason: "tool_calls",
        },
      ],
      usage: makeUsage(promptTokens, approxTokens(completionText)),
    });
  }

  const reply = mockAssistantReply(question);
  completionText = reply;
  const usage = makeUsage(promptTokens, approxTokens(reply));

  if (body.stream) {
    return sseResponse(async (emit) => {
      const chunk = (delta: unknown, finish_reason: string | null) => ({
        ...envelope,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta, logprobs: null, finish_reason }],
      });
      await emit(chunk({ role: "assistant", content: "" }, null));
      for (const piece of splitForStreaming(reply)) {
        await emit(chunk({ content: piece }, null));
      }
      await emit(chunk({}, "stop"));
      if (includeUsage) {
        await emit({ ...envelope, object: "chat.completion.chunk", choices: [], usage });
      }
    });
  }

  const n = Math.max(1, Math.min(body.n ?? 1, 4));
  return json({
    ...envelope,
    object: "chat.completion",
    choices: Array.from({ length: n }, (_, index) => ({
      index,
      message: { role: "assistant", content: reply, refusal: null },
      logprobs: null,
      finish_reason: "stop",
    })),
    usage: makeUsage(promptTokens, approxTokens(reply) * n),
  });
}
