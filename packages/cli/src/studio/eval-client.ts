import {
  StudioEvalDetailSchema,
  StudioEvalHistorySchema,
  StudioEvalStartRequestSchema,
  StudioEvalTargetsResponseSchema,
} from "@kortyx/agent/evals";
import { z } from "zod";
import { StudioApiTransport, StudioReadError } from "./read-client";

const StartRequestSchema = StudioEvalStartRequestSchema;
export type StartEvalRequest = z.input<typeof StartRequestSchema>;

export const parseEvalRunTarget = (input: string) => {
  let id = input;
  let url: string | undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    let locator: URL;
    try {
      locator = new URL(input);
    } catch {
      throw new StudioReadError("invalid_target", "Invalid eval run URL.");
    }
    const match = locator.pathname.match(/\/evals\/runs\/([^/]+)\/?$/);
    if (
      !match ||
      !["http:", "https:"].includes(locator.protocol) ||
      locator.username ||
      locator.password
    )
      throw new StudioReadError(
        "invalid_target",
        "Expected an HTTP(S) Studio /evals/runs/<uuid> URL without credentials.",
      );
    id = match[1] ?? "";
    locator.search = "";
    locator.hash = "";
    url = locator.toString();
  }
  if (!z.uuid().safeParse(id).success)
    throw new StudioReadError("invalid_target", "Expected an eval run UUID.");
  return { id, url };
};

/** Only suite discovery, saved eval reads, enqueue and cooperative cancellation. */
export class StudioEvalClient extends StudioApiTransport {
  targets() {
    return this.requestJson(
      "GET",
      "/v1/studio/evals/targets",
      StudioEvalTargetsResponseSchema,
    );
  }
  runs() {
    return this.requestJson(
      "GET",
      "/v1/studio/evals/runs",
      StudioEvalHistorySchema,
    );
  }
  run(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new StudioReadError("invalid_target", "Expected an eval run UUID.");
    return this.requestJson(
      "GET",
      `/v1/studio/evals/runs/${id}`,
      StudioEvalDetailSchema,
    );
  }
  start(input: StartEvalRequest) {
    const parsed = StartRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new StudioReadError(
        "invalid_eval_request",
        "Invalid suite revision, case selection, or execution limits.",
      );
    return this.requestJson(
      "POST",
      "/v1/studio/evals/runs",
      z.object({ id: z.uuid() }),
      {},
      parsed.data,
    );
  }
  cancel(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new StudioReadError("invalid_target", "Expected an eval run UUID.");
    return this.requestJson(
      "POST",
      `/v1/studio/evals/runs/${id}/cancel`,
      z.object({ ok: z.literal(true) }),
    );
  }
}
