/** GET /v1/models and GET /v1/models/{id} */

import { MODELS } from "./mock-data";
import { errorResponse, json } from "./util";

export function handleListModels(): Response {
  return json({ object: "list", data: MODELS });
}

export function handleRetrieveModel(id: string): Response {
  const model = MODELS.find((m) => m.id === id);
  if (!model) {
    return errorResponse(
      404,
      `The model '${id}' does not exist or you do not have access to it.`,
      "invalid_request_error",
      "model_not_found",
    );
  }
  return json(model);
}
