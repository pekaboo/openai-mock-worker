/** Router: OpenAI-compatible mock API on Cloudflare Workers. */

import { handleChatCompletions } from "./chat";
import { handleCompletions } from "./completions";
import { handleEmbeddings } from "./embeddings";
import { handleListModels, handleRetrieveModel } from "./models";
import { errorResponse, json, preflight } from "./util";

/** Strip trailing slashes and an optional `/v1` prefix so both base URLs work. */
function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  const withoutV1 = trimmed.replace(/^\/v1(?=\/|$)/, "");
  return withoutV1 === "" ? "/" : withoutV1;
}

function methodNotAllowed(method: string): Response {
  return errorResponse(405, `Method ${method} is not allowed for this endpoint.`);
}

function infoResponse(origin: string): Response {
  return json({
    name: "openai-mock-worker",
    description:
      "OpenAI-compatible mock API running on Cloudflare Workers. All responses are mocked — no real model is called.",
    base_url: `${origin}/v1`,
    endpoints: [
      "GET  /v1/models",
      "GET  /v1/models/{model}",
      "POST /v1/chat/completions",
      "POST /v1/completions",
      "POST /v1/embeddings",
    ],
    auth: "Any Authorization header is accepted (or none).",
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight();

    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method;

    try {
      if (path === "/") {
        if (method !== "GET") return methodNotAllowed(method);
        return infoResponse(url.origin);
      }
      if (path === "/health") {
        return json({ status: "ok" });
      }
      if (path === "/models") {
        if (method !== "GET") return methodNotAllowed(method);
        return handleListModels();
      }
      if (path.startsWith("/models/")) {
        if (method !== "GET") return methodNotAllowed(method);
        return handleRetrieveModel(decodeURIComponent(path.slice("/models/".length)));
      }
      if (path === "/chat/completions") {
        if (method !== "POST") return methodNotAllowed(method);
        return await handleChatCompletions(request);
      }
      if (path === "/completions") {
        if (method !== "POST") return methodNotAllowed(method);
        return await handleCompletions(request);
      }
      if (path === "/embeddings") {
        if (method !== "POST") return methodNotAllowed(method);
        return await handleEmbeddings(request);
      }
      return errorResponse(404, `Unknown request URL: ${method} ${url.pathname}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResponse(500, message, "server_error");
    }
  },
} satisfies ExportedHandler<Env>;
