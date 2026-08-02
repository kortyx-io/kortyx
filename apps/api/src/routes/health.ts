import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApiEnv } from "../types";

const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("kortyx-api"),
});

const route = createRoute({
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

export const registerHealthRoutes = (app: OpenAPIHono<ApiEnv>): void => {
  app.openapi(route, (c) =>
    c.json({ status: "ok", service: "kortyx-api" }, 200),
  );
};
