import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  StudioCatalogsResponseSchema,
  StudioInterruptDetailResponseSchema,
  StudioInterruptsResponseSchema,
  StudioRunDetailResponseSchema,
  StudioRunsResponseSchema,
  StudioSessionDetailResponseSchema,
  StudioSessionsResponseSchema,
  StudioWorkflowsResponseSchema,
} from "@kortyx/telemetry-contracts";
import {
  getStudioInterruptReadModel,
  getStudioReadModels,
  getStudioRunReadModel,
  getStudioSessionReadModel,
  listStudioInterrupts,
  listStudioRuns,
  listStudioSessions,
} from "@kortyx/telemetry-db";
import type { ApiEnv } from "../types";

const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

const securedResponses = {
  401: {
    description: "Missing or invalid API key.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  403: {
    description: "API key lacks Studio read permission.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

const detailParams = (name: "runId" | "sessionId" | "interruptId") =>
  z.object({ [name]: z.string().min(1) });

const notFoundResponse = {
  404: {
    description: "The requested Studio entity was not found.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

const listQuerySchema = z.object({
  q: z.string().optional(),
  env: z.string().optional(),
  range: z.string().optional(),
  startedAfter: z.string().optional(),
  startedBefore: z.string().optional(),
  status: z.string().optional(),
  provider: z.string().optional(),
  type: z.string().optional(),
  outcome: z.string().optional(),
  workflow: z.string().optional(),
  version: z.string().optional(),
  transition: z.string().optional(),
  path: z.string().optional(),
  session: z.string().optional(),
  user: z.string().optional(),
  tenant: z.string().optional(),
  model: z.string().optional(),
  result: z.string().optional(),
  node: z.string().optional(),
  resolver: z.string().optional(),
  tags: z.string().optional(),
  tool: z.string().optional(),
  error: z.string().optional(),
  interrupt: z.string().optional(),
  checkpoint: z.string().optional(),
  fork: z.string().optional(),
  minCost: z.string().optional(),
  maxCost: z.string().optional(),
  minDuration: z.string().optional(),
  maxDuration: z.string().optional(),
  minTokens: z.string().optional(),
  maxTokens: z.string().optional(),
  minAge: z.string().optional(),
  maxAge: z.string().optional(),
  cursor: z.string().optional(),
  pageSize: z.string().optional(),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

const runsRoute = createRoute({
  method: "get",
  path: "/v1/studio/runs",
  request: { query: listQuerySchema },
  security: [{ TelemetryApiKey: [] }],
  responses: {
    200: {
      description: "Projected Studio run rows.",
      content: { "application/json": { schema: StudioRunsResponseSchema } },
    },
    ...securedResponses,
  },
});

const runDetailRoute = createRoute({
  method: "get",
  path: "/v1/studio/runs/{runId}",
  request: { params: detailParams("runId") },
  security: [{ TelemetryApiKey: [] }],
  responses: {
    200: {
      description: "Projected Studio run detail and ordered telemetry events.",
      content: {
        "application/json": { schema: StudioRunDetailResponseSchema },
      },
    },
    ...notFoundResponse,
    ...securedResponses,
  },
});

const sessionsRoute = createRoute({
  method: "get",
  path: "/v1/studio/sessions",
  request: { query: listQuerySchema },
  security: [{ TelemetryApiKey: [] }],
  responses: {
    200: {
      description: "Projected Studio session rows.",
      content: {
        "application/json": { schema: StudioSessionsResponseSchema },
      },
    },
    ...securedResponses,
  },
});

const sessionDetailRoute = createRoute({
  method: "get",
  path: "/v1/studio/sessions/{sessionId}",
  request: { params: detailParams("sessionId") },
  security: [{ TelemetryApiKey: [] }],
  responses: {
    200: {
      description:
        "Projected Studio session detail, runs, and lifecycle events.",
      content: {
        "application/json": { schema: StudioSessionDetailResponseSchema },
      },
    },
    ...notFoundResponse,
    ...securedResponses,
  },
});

const interruptsRoute = createRoute({
  method: "get",
  path: "/v1/studio/interrupts",
  request: { query: listQuerySchema },
  security: [{ TelemetryApiKey: [] }],
  responses: {
    200: {
      description: "Projected Studio interrupt rows.",
      content: {
        "application/json": { schema: StudioInterruptsResponseSchema },
      },
    },
    ...securedResponses,
  },
});

const interruptDetailRoute = createRoute({
  method: "get",
  path: "/v1/studio/interrupts/{interruptId}",
  request: { params: detailParams("interruptId") },
  security: [{ TelemetryApiKey: [] }],
  responses: {
    200: {
      description:
        "Projected Studio interrupt decision and resume audit trail.",
      content: {
        "application/json": { schema: StudioInterruptDetailResponseSchema },
      },
    },
    ...notFoundResponse,
    ...securedResponses,
  },
});

const workflowsRoute = createRoute({
  method: "get",
  path: "/v1/studio/workflows",
  security: [{ TelemetryApiKey: [] }],
  responses: {
    200: {
      description: "Projected Studio workflow topology and metrics.",
      content: {
        "application/json": { schema: StudioWorkflowsResponseSchema },
      },
    },
    ...securedResponses,
  },
});

const catalogsRoute = createRoute({
  method: "get",
  path: "/v1/studio/catalogs",
  security: [{ TelemetryApiKey: [] }],
  responses: {
    200: {
      description: "Studio filter catalogs.",
      content: {
        "application/json": { schema: StudioCatalogsResponseSchema },
      },
    },
    ...securedResponses,
  },
});

export const registerStudioRoutes = (app: OpenAPIHono<ApiEnv>): void => {
  app.openapi(runsRoute, async (c) => {
    const auth = c.get("auth");
    const page = await listStudioRuns(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      query: c.req.valid("query"),
    });
    return c.json({ runs: page.items, totalCount: page.totalCount }, 200);
  });
  app.openapi(runDetailRoute, async (c) => {
    const auth = c.get("auth");
    const { runId } = c.req.valid("param");
    if (!runId) {
      return c.json({ error: "not_found", message: "Run not found." }, 404);
    }
    const models = await getStudioRunReadModel(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      runId,
    });
    const run = models.runs.find((item) => item.id === runId);
    if (!run) {
      return c.json({ error: "not_found", message: "Run not found." }, 404);
    }
    const events = models.detailEvents.filter((event) => event.runId === runId);
    const updatedAt = events.at(-1)?.receivedAt ?? run.startedAt;
    return c.json(
      {
        run,
        events,
        session:
          models.sessions.find((item) => item.id === run.sessionId) ?? null,
        interrupts: models.interrupts.filter((item) => item.runId === runId),
        updatedAt,
      },
      200,
    );
  });
  app.openapi(sessionsRoute, async (c) => {
    const auth = c.get("auth");
    const page = await listStudioSessions(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      query: c.req.valid("query"),
    });
    return c.json({ sessions: page.items, totalCount: page.totalCount }, 200);
  });
  app.openapi(sessionDetailRoute, async (c) => {
    const auth = c.get("auth");
    const { sessionId } = c.req.valid("param");
    if (!sessionId) {
      return c.json({ error: "not_found", message: "Session not found." }, 404);
    }
    const models = await getStudioSessionReadModel(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      sessionId,
    });
    const session = models.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return c.json({ error: "not_found", message: "Session not found." }, 404);
    }
    const events = models.detailEvents.filter(
      (event) => event.sessionId === sessionId,
    );
    return c.json(
      {
        session,
        runs: models.runs.filter((item) => item.sessionId === sessionId),
        events,
        interrupts: models.interrupts.filter(
          (item) => item.sessionId === sessionId,
        ),
        updatedAt: events.at(-1)?.receivedAt ?? session.lastActivityAt,
      },
      200,
    );
  });
  app.openapi(interruptsRoute, async (c) => {
    const auth = c.get("auth");
    const page = await listStudioInterrupts(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      query: c.req.valid("query"),
    });
    return c.json({ interrupts: page.items, totalCount: page.totalCount }, 200);
  });
  app.openapi(interruptDetailRoute, async (c) => {
    const auth = c.get("auth");
    const { interruptId } = c.req.valid("param");
    if (!interruptId) {
      return c.json(
        { error: "not_found", message: "Interrupt not found." },
        404,
      );
    }
    const models = await getStudioInterruptReadModel(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      interruptId,
    });
    const interrupt = models.interrupts.find((item) => item.id === interruptId);
    if (!interrupt) {
      return c.json(
        { error: "not_found", message: "Interrupt not found." },
        404,
      );
    }
    const events = models.detailEvents.filter(
      (event) => event.payload.interruptId === interruptId,
    );
    const run = models.runs.find((item) => item.id === interrupt.runId) ?? null;
    return c.json(
      {
        interrupt,
        events,
        run,
        session:
          models.sessions.find((item) => item.id === interrupt.sessionId) ??
          null,
        updatedAt: events.at(-1)?.receivedAt ?? interrupt.createdAt,
      },
      200,
    );
  });
  app.openapi(workflowsRoute, async (c) => {
    const auth = c.get("auth");
    const models = await getStudioReadModels(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
    });
    return c.json(models.workflows, 200);
  });
  app.openapi(catalogsRoute, async (c) => {
    const auth = c.get("auth");
    const models = await getStudioReadModels(c.get("db"), {
      organizationId: auth.organizationId,
      projectId: auth.projectId,
    });
    return c.json(models.catalogs, 200);
  });
};
