import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  EnsureWorkflowTopologyRequestSchema,
  EnsureWorkflowTopologyResponseSchema,
} from "@kortyx/telemetry-contracts";
import { ensureWorkflowRevision } from "@kortyx/telemetry-db";
import type { ApiEnv } from "../../types";

const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

const route = createRoute({
  method: "post",
  path: "/v1/telemetry/workflow-revisions:ensure",
  security: [{ TelemetryApiKey: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: EnsureWorkflowTopologyRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Ensured immutable workflow topology revision.",
      content: {
        "application/json": {
          schema: EnsureWorkflowTopologyResponseSchema,
        },
      },
    },
    401: {
      description: "Missing or invalid telemetry API key.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    403: {
      description: "Telemetry API key lacks permission or environment access.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const registerWorkflowRevisionRoutes = (
  app: OpenAPIHono<ApiEnv>,
): void => {
  app.openapi(route, async (c) => {
    const body = c.req.valid("json");
    const auth = c.get("auth");
    const response = await ensureWorkflowRevision(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      request: body,
    });

    return c.json(response, 200);
  });
};
