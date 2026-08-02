import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  TelemetryEventBatchResponseSchema,
  TelemetryEventBatchSchema,
} from "@kortyx/telemetry-contracts";
import { ingestTelemetryEvents } from "@kortyx/telemetry-db";
import type { ApiEnv } from "../../types";

const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

const request = {
  body: {
    required: true,
    content: {
      "application/json": {
        schema: TelemetryEventBatchSchema,
      },
    },
  },
} as const;

const responses = {
  200: {
    description:
      "Telemetry events were accepted. Duplicate event IDs are no-ops.",
    content: {
      "application/json": {
        schema: TelemetryEventBatchResponseSchema,
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
};

const eventsRoute = createRoute({
  method: "post",
  path: "/v1/telemetry/events",
  security: [{ TelemetryApiKey: [] }],
  request,
  responses,
});

const eventsBatchRoute = createRoute({
  method: "post",
  path: "/v1/telemetry/events:batch",
  security: [{ TelemetryApiKey: [] }],
  request,
  responses,
});

export const registerTelemetryEventRoutes = (
  app: OpenAPIHono<ApiEnv>,
): void => {
  app.openapi(eventsRoute, async (c) => {
    const body = c.req.valid("json");
    const auth = c.get("auth");
    const response = await ingestTelemetryEvents(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      events: body.events,
    });

    return c.json(response, 200);
  });
  app.openapi(eventsBatchRoute, async (c) => {
    const body = c.req.valid("json");
    const auth = c.get("auth");
    const response = await ingestTelemetryEvents(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      events: body.events,
    });

    return c.json(response, 200);
  });
};
