import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { STUDIO_API_PROTOCOL_VERSION } from "@kortyx/telemetry-contracts";
import type { TelemetryDb } from "@kortyx/telemetry-db";
import { apiErrorHandler } from "./errors";
import { apiKeyAuth } from "./middleware/api-key-auth";
import {
  createNoopStudioChangeBus,
  type StudioChangeBus,
} from "./realtime/studio-change-bus";
import { registerHealthRoutes } from "./routes/health";
import {
  registerStudioReviewRoutes,
  registerUserFeedbackRoutes,
} from "./routes/scores";
import { registerStudioRoutes } from "./routes/studio";
import { registerStudioChangeRoutes } from "./routes/studio-changes";
import { registerTelemetryEventRoutes } from "./routes/telemetry/events";
import { registerWorkflowRevisionRoutes } from "./routes/telemetry/workflow-revisions";
import type { ApiEnv } from "./types";

export type CreateApiAppOptions = {
  db: TelemetryDb;
  apiKeyPepper: string;
  studioChangeBus?: StudioChangeBus;
  readiness?: () => Promise<void>;
};

export const createApiApp = (options: CreateApiAppOptions) => {
  const app = new OpenAPIHono<ApiEnv>({
    defaultHook: (result, c) => {
      if (result.success) return;
      return c.json(
        {
          error: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: result.error.flatten(),
          requestId: c.get("requestId"),
        },
        400,
      );
    },
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "TelemetryApiKey", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "ktyx_test_<keyId>_<secret>",
  });

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.set("db", options.db);
    c.header("x-request-id", requestId);
    c.header("x-kortyx-studio-api-version", STUDIO_API_PROTOCOL_VERSION);
    c.header(
      "x-kortyx-studio-release",
      process.env.KORTYX_STUDIO_RELEASE ?? "development",
    );
    await next();
  });

  app.onError(apiErrorHandler);

  registerHealthRoutes(app, options.readiness ?? (() => Promise.resolve()));

  app.use(
    "/v1/telemetry/*",
    apiKeyAuth({
      pepper: options.apiKeyPepper,
      requiredScope: "telemetry:write",
    }),
  );
  registerWorkflowRevisionRoutes(app);
  registerTelemetryEventRoutes(app);
  registerUserFeedbackRoutes(app);

  app.use(
    "/v1/studio/*",
    apiKeyAuth({
      pepper: options.apiKeyPepper,
      requiredScope: "studio:read",
    }),
  );
  registerStudioRoutes(app);
  registerStudioReviewRoutes(app);
  registerStudioChangeRoutes(
    app,
    options.studioChangeBus ?? createNoopStudioChangeBus(),
  );

  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Kortyx Telemetry API",
      version: "0.1.0",
    },
  });
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  return app;
};
