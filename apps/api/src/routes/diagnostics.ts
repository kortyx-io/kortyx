import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  DiagnosticManifestSchema,
  DiagnosticPartSchema,
  DiagnosticResponseSchema,
} from "@kortyx/telemetry-contracts";
import {
  beginErrorDiagnostic,
  completeErrorDiagnostic,
  getErrorDiagnostic,
  putErrorDiagnosticPart,
} from "@kortyx/telemetry-db";
import { bodyLimit } from "hono/body-limit";
import {
  principalActorId,
  requireApiAction,
  requirePrincipalEnvironment,
} from "../middleware/security";
import type { ApiEnv } from "../types";

const params = z.object({ diagnosticId: z.string().uuid() });
const query = z.object({
  env: z.string().min(1).max(256),
  download: z.enum(["1"]).optional(),
});
const ack = z.object({ state: z.string() });
const errors = {
  400: { description: "Invalid upload or diagnostic content." },
  401: { description: "Authentication required." },
  403: { description: "Diagnostic permission or environment access denied." },
  404: { description: "Diagnostic not received or no longer retained." },
};
const jsonBody = (schema: z.ZodType) => ({
  body: { required: true, content: { "application/json": { schema } } },
});

export function registerDiagnosticRoutes(app: OpenAPIHono<ApiEnv>) {
  app.use("/v1/telemetry/diagnostics", bodyLimit({ maxSize: 32_768 }));
  app.use("/v1/telemetry/diagnostics/*", bodyLimit({ maxSize: 100_000 }));
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/telemetry/diagnostics",
      security: [{ TelemetryApiKey: [] }],
      request: jsonBody(DiagnosticManifestSchema),
      responses: {
        200: {
          description: "Manifest durably accepted.",
          content: { "application/json": { schema: ack } },
        },
        ...errors,
      },
    }),
    async (c) => {
      const manifest = DiagnosticManifestSchema.parse(await c.req.json());
      const principal = c.get("principal");
      requirePrincipalEnvironment(principal, [manifest.environment]);
      const result = await c.get("withTenantDatabase")((db) =>
        beginErrorDiagnostic(db, {
          organizationId: principal.organizationId,
          projectId: principal.projectId,
          manifest,
        }),
      );
      return c.json(result, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/telemetry/diagnostics/{diagnosticId}/parts",
      security: [{ TelemetryApiKey: [] }],
      request: { params, query, ...jsonBody(DiagnosticPartSchema) },
      responses: {
        200: {
          description: "Part durably accepted.",
          content: { "application/json": { schema: ack } },
        },
        ...errors,
      },
    }),
    async (c) => {
      const principal = c.get("principal");
      const { diagnosticId } = c.req.valid("param");
      const { env } = c.req.valid("query");
      requirePrincipalEnvironment(principal, [env]);
      const part = DiagnosticPartSchema.parse(await c.req.json());
      const result = await c.get("withTenantDatabase")((db) =>
        putErrorDiagnosticPart(
          db,
          {
            organizationId: principal.organizationId,
            projectId: principal.projectId,
            environment: env,
            diagnosticId,
          },
          part,
        ),
      );
      return c.json(result, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/telemetry/diagnostics/{diagnosticId}/complete",
      security: [{ TelemetryApiKey: [] }],
      request: { params, query },
      responses: {
        200: {
          description: "Diagnostic completeness verified.",
          content: { "application/json": { schema: ack } },
        },
        ...errors,
      },
    }),
    async (c) => {
      const principal = c.get("principal");
      const { diagnosticId } = c.req.valid("param");
      const { env } = c.req.valid("query");
      requirePrincipalEnvironment(principal, [env]);
      const result = await c.get("withTenantDatabase")((db) =>
        completeErrorDiagnostic(db, {
          organizationId: principal.organizationId,
          projectId: principal.projectId,
          environment: env,
          diagnosticId,
        }),
      );
      return c.json(result, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/studio/diagnostics/{diagnosticId}",
      security: [{ StudioAccessToken: [] }],
      request: { params, query },
      responses: {
        200: {
          description: "Private diagnostic and completeness state.",
          content: { "application/json": { schema: DiagnosticResponseSchema } },
        },
        ...errors,
      },
    }),
    async (c) => {
      await requireApiAction(c, "diagnostics:read");
      const principal = c.get("principal");
      const { diagnosticId } = c.req.valid("param");
      const { env, download } = c.req.valid("query");
      requirePrincipalEnvironment(principal, [env]);
      const result = await c.get("withTenantDatabase")((db) =>
        getErrorDiagnostic(
          db,
          {
            organizationId: principal.organizationId,
            projectId: principal.projectId,
            environment: env,
            diagnosticId,
          },
          principalActorId(principal),
          download === "1",
        ),
      );
      c.header("cache-control", "private, no-store");
      return c.json(result, 200);
    },
  );
}
