import { createHash } from "node:crypto";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ClearScoreResponseSchema,
  ClearUserFeedbackRequestSchema,
  StudioReviewRequestSchema,
  StudioScoreResponseSchema,
  UserFeedbackRequestSchema,
} from "@kortyx/telemetry-contracts";
import {
  clearRunScore,
  TelemetryForbiddenError,
  upsertRunScore,
} from "@kortyx/telemetry-db";
import { bodyLimit } from "hono/body-limit";
import type { ApiEnv } from "../types";

const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});
const errors = {
  400: {
    description: "Invalid score request.",
    content: { "application/json": { schema: errorSchema } },
  },
  401: {
    description: "Missing or invalid API key.",
    content: { "application/json": { schema: errorSchema } },
  },
  403: {
    description: "Missing write permission or environment access.",
    content: { "application/json": { schema: errorSchema } },
  },
  404: {
    description: "Run not found within this project.",
    content: { "application/json": { schema: errorSchema } },
  },
};
const security = [{ TelemetryApiKey: [] }];
const scoreResponse = {
  200: {
    description: "Current score, upserted per actor and run.",
    content: { "application/json": { schema: StudioScoreResponseSchema } },
  },
  ...errors,
};
const clearResponse = {
  200: {
    description: "The actor's current score was cleared.",
    content: { "application/json": { schema: ClearScoreResponseSchema } },
  },
  ...errors,
};
const feedbackRoute = createRoute({
  method: "post",
  path: "/v1/telemetry/scores",
  security,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UserFeedbackRequestSchema } },
    },
  },
  responses: scoreResponse,
});
const clearFeedbackRoute = createRoute({
  method: "delete",
  path: "/v1/telemetry/scores",
  security,
  request: {
    body: {
      required: true,
      content: {
        "application/json": { schema: ClearUserFeedbackRequestSchema },
      },
    },
  },
  responses: clearResponse,
});
const reviewRoute = createRoute({
  method: "post",
  path: "/v1/studio/runs/{runId}/review",
  security,
  request: {
    params: z.object({ runId: z.string().min(1).max(512) }),
    body: {
      required: true,
      content: { "application/json": { schema: StudioReviewRequestSchema } },
    },
  },
  responses: scoreResponse,
});
const clearReviewRoute = createRoute({
  method: "delete",
  path: "/v1/studio/runs/{runId}/review",
  security,
  request: { params: z.object({ runId: z.string().min(1).max(512) }) },
  responses: clearResponse,
});

export const studioReviewActorId = (keyId: string) =>
  `studio-key:${createHash("sha256").update(keyId).digest("hex").slice(0, 24)}`;
export function registerUserFeedbackRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.use("/v1/telemetry/scores", bodyLimit({ maxSize: 16_384 }));
  app.openapi(feedbackRoute, async (c) => {
    const body = c.req.valid("json");
    const auth = c.get("auth");
    const score = await upsertRunScore(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      runId: body.runId,
      actorId: body.actorId,
      value: body.value,
      name: "user-feedback",
      dataType: "BOOLEAN",
      source: "end-user",
      reasons: body.reasons ?? [],
      comment: body.comment || null,
    });
    return c.json({ score }, 200);
  });
  app.openapi(clearFeedbackRoute, async (c) => {
    const body = c.req.valid("json");
    const auth = c.get("auth");
    await clearRunScore(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      ...body,
      source: "end-user",
      name: "user-feedback",
    });
    return c.json({ ok: true as const }, 200);
  });
}

export function registerStudioReviewRoutes(app: OpenAPIHono<ApiEnv>): void {
  app.use("/v1/studio/runs/:runId/review", bodyLimit({ maxSize: 16_384 }));
  app.openapi(reviewRoute, async (c) => {
    const auth = c.get("auth");
    if (!auth.scopes.includes("studio:write"))
      throw new TelemetryForbiddenError(
        "Studio reviews require studio:write scope.",
      );
    const { runId } = c.req.valid("param");
    const body = c.req.valid("json");
    const score = await upsertRunScore(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      runId,
      actorId: studioReviewActorId(auth.keyId),
      source: "human-review",
      name: "correctness",
      dataType: "CATEGORICAL",
      value: body.value,
      reasons: [],
      comment: body.comment || null,
    });
    return c.json({ score }, 200);
  });
  app.openapi(clearReviewRoute, async (c) => {
    const auth = c.get("auth");
    if (!auth.scopes.includes("studio:write"))
      throw new TelemetryForbiddenError(
        "Studio reviews require studio:write scope.",
      );
    await clearRunScore(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      runId: c.req.valid("param").runId,
      actorId: studioReviewActorId(auth.keyId),
      source: "human-review",
      name: "correctness",
    });
    return c.json({ ok: true as const }, 200);
  });
}
