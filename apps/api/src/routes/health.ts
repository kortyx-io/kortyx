import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApiEnv } from "../types";

const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("kortyx-api"),
});

const UnavailableResponseSchema = z.object({
  status: z.literal("unavailable"),
  service: z.literal("kortyx-api"),
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      description: "API liveness check.",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

const liveRoute = createRoute({
  method: "get",
  path: "/live",
  responses: {
    200: {
      description: "API liveness check.",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

const readyRoute = createRoute({
  method: "get",
  path: "/ready",
  responses: {
    200: {
      description: "API readiness check, including durable dependencies.",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
    503: {
      description: "API is alive but cannot currently serve requests.",
      content: {
        "application/json": {
          schema: UnavailableResponseSchema,
        },
      },
    },
  },
});

export const registerHealthRoutes = (
  app: OpenAPIHono<ApiEnv>,
  readiness: () => Promise<void>,
): void => {
  app.openapi(healthRoute, (c) =>
    c.json({ status: "ok", service: "kortyx-api" }, 200),
  );
  app.openapi(liveRoute, (c) =>
    c.json({ status: "ok", service: "kortyx-api" }, 200),
  );
  app.openapi(readyRoute, async (c) => {
    try {
      await readiness();
      return c.json({ status: "ok", service: "kortyx-api" }, 200);
    } catch {
      return c.json({ status: "unavailable", service: "kortyx-api" }, 503);
    }
  });
};
