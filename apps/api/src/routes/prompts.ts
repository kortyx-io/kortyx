import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { getEvalSuiteRevision } from "@kortyx/agent";
import {
  type EvalSuite,
  StudioEvaluationSummarySchema,
} from "@kortyx/agent/evals";
import {
  PromptContentSchema,
  PromptError,
  PromptKeySchema,
  PromptSnapshotSchema,
  PromptVersionSchema,
} from "@kortyx/prompts";
import {
  PromptDetailSchema,
  PromptLibrarySchema,
  PromptMutationSchema,
  PromptStoredVersionSchema,
  PromptTransferRequestSchema,
  StudioRunSchema,
} from "@kortyx/telemetry-contracts";
import {
  applyPromptTransfer,
  exportPrompts,
  getPrompt,
  listEvaluations,
  listPrompts,
  listStudioRuns,
  mutatePrompt,
  planPromptTransfer,
  resolvePrompts,
} from "@kortyx/telemetry-db";
import { bodyLimit } from "hono/body-limit";
import type { EvalTargetAdapter } from "../evals/contracts";
import { type EvalTarget, fetchEvalManifest } from "../evals/targets";

// OpenAPI's generator cannot traverse z.json()'s anonymous recursive union.
// Document JSON object values without recursion; storage/serving still validate
// the complete portable contracts, including format refinements and JSON values.
const contentDocument = z.object({
  ...PromptContentSchema.shape,
  variablesSchema: z.record(z.string(), z.unknown()),
  configSchema: z.record(z.string(), z.unknown()),
  config: z.record(z.string(), z.unknown()),
});
const snapshotDocument = PromptSnapshotSchema.extend({
  versions: z.record(
    z.string(),
    PromptVersionSchema.extend({ content: contentDocument }),
  ),
});
const detailDocument = PromptDetailSchema.extend({
  versions: z.array(
    PromptStoredVersionSchema.extend({ content: contentDocument }),
  ),
  draft: contentDocument.nullable(),
});
const mutationDocument = z
  .union(
    PromptMutationSchema.options.map((option) =>
      "content" in option.shape
        ? z.object({ ...option.shape, content: contentDocument }).strict()
        : option,
    ),
  )
  .transform((value) => PromptMutationSchema.parse(value));

import {
  canApiAction,
  principalActorId,
  requireApiAction,
  requirePrincipalEnvironment,
} from "../middleware/security";
import type { ApiEnv } from "../types";

const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 500].map((status) => [
    status,
    {
      description: "Request rejected.",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            message: z.string(),
            requestId: z.string().optional(),
          }),
        },
      },
    },
  ]),
);
const readSecurity = [{ TelemetryApiKey: [] }, { StudioAccessToken: [] }];
const serve = createRoute({
  method: "post",
  path: "/v1/prompts/resolve",
  security: [{ TelemetryApiKey: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              schemaVersion: z.literal(1),
              environment: z.string().min(1).max(128),
              ids: z
                .array(PromptKeySchema)
                .max(100)
                .refine(
                  (ids) => new Set(ids).size === ids.length,
                  "Duplicate prompt references.",
                ),
              versions: z
                .record(PromptKeySchema, z.number().int().positive())
                .optional(),
            })
            .strict(),
        },
      },
    },
  },
  responses: {
    200: {
      description:
        "One atomic assignment snapshot including exact dependencies.",
      content: {
        "application/json": {
          schema: snapshotDocument as z.ZodType<unknown>,
        },
      },
    },
    ...errors,
  },
});
const list = createRoute({
  method: "get",
  path: "/v1/studio/prompts",
  security: readSecurity,
  request: {
    query: z.object({
      search: z.string().max(200).optional(),
      categoryId: z.union([z.uuid(), z.literal("root")]).optional(),
      cursor: z
        .string()
        .regex(/^\d{1,9}$/)
        .optional(),
      archived: z.enum(["true", "false"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Project prompt library.",
      content: { "application/json": { schema: PromptLibrarySchema } },
    },
    ...errors,
  },
});
const detail = createRoute({
  method: "get",
  path: "/v1/studio/prompts/assets/{id}",
  security: readSecurity,
  request: {
    params: z.object({ id: z.string().min(1).max(200) }),
    query: z.object({
      lookup: z.literal("key").optional(),
      versionsCursor: z
        .string()
        .regex(/^\d{1,9}$/)
        .optional(),
      version: z.coerce.number().int().positive().optional(),
    }),
  },
  responses: {
    200: {
      description: "Prompt versions, evidence, usage, drafts and activity.",
      content: {
        "application/json": {
          schema: detailDocument as z.ZodType<unknown>,
        },
      },
    },
    ...errors,
  },
});
const mutate = createRoute({
  method: "post",
  path: "/v1/studio/prompts/actions",
  security: readSecurity,
  request: {
    body: {
      required: true,
      content: {
        "application/json": { schema: mutationDocument as z.ZodType<unknown> },
      },
    },
  },
  responses: {
    200: {
      description: "Mutation committed atomically.",
      content: {
        "application/json": { schema: z.record(z.string(), z.unknown()) },
      },
    },
    ...errors,
  },
});

const tables = createRoute({
  method: "get",
  path: "/v1/studio/prompts/assets/{id}/tables",
  security: readSecurity,
  request: {
    params: z.object({ id: z.uuid() }),
    query: z.object({ version: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description:
        "Canonical run and evaluation rows attached to one prompt version.",
      content: {
        "application/json": {
          schema: z.object({
            runs: z.array(StudioRunSchema),
            evaluations: z.array(StudioEvaluationSummarySchema),
          }),
        },
      },
    },
    ...errors,
  },
});

export function registerPromptRoutes(
  app: OpenAPIHono<ApiEnv>,
  targets: readonly EvalTarget[] = [],
  adapter?: EvalTargetAdapter,
) {
  app.use("/v1/prompts/*", bodyLimit({ maxSize: 1_048_576 }));
  app.use("/v1/studio/prompts/*", (c, next) =>
    bodyLimit({
      maxSize: c.req.path.endsWith("/transfers/plan")
        ? 20 * 1024 * 1024
        : 1_048_576,
    })(c, next),
  );
  app.post("/v1/studio/prompts/export", async (c) => {
    const body = z
      .object({
        keys: z.array(PromptKeySchema).min(1).max(100),
        versions: z
          .record(PromptKeySchema, z.number().int().positive())
          .optional(),
        history: z.boolean().optional(),
        groups: z.boolean().optional(),
        apiUrl: z.url(),
      })
      .strict()
      .parse(await c.req.json());
    return c.json(
      (await c.get("withTenantDatabase")((db) =>
        exportPrompts(db, c.get("principal"), {
          keys: body.keys,
          apiUrl: body.apiUrl,
          ...(body.versions ? { versions: body.versions } : {}),
          ...(body.history !== undefined ? { history: body.history } : {}),
          ...(body.groups !== undefined ? { groups: body.groups } : {}),
        }),
      )) as unknown,
    );
  });
  app.post("/v1/studio/prompts/transfers/plan", async (c) => {
    await requireApiAction(c, "studio:write");
    const body = PromptTransferRequestSchema.parse(await c.req.json());
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        planPromptTransfer(
          db,
          c.get("principal"),
          principalActorId(c.get("principal")),
          body,
        ),
      ),
    );
  });
  app.post("/v1/studio/prompts/transfers/:id/apply", async (c) => {
    await requireApiAction(c, "studio:write");
    const id = z.uuid().parse(c.req.param("id")),
      body = z
        .object({ bundleHash: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .parse(await c.req.json());
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        applyPromptTransfer(
          db,
          c.get("principal"),
          principalActorId(c.get("principal")),
          id,
          body.bundleHash,
        ),
      ),
    );
  });
  app.openapi(serve, async (c) => {
    const principal = c.get("principal"),
      body = c.req.valid("json");
    requirePrincipalEnvironment(principal, [body.environment]);
    const result = await c.get("withTenantDatabase")((db) =>
      resolvePrompts(db, principal, {
        ids: body.ids,
        environment: body.environment,
        ...(body.versions ? { versions: body.versions } : {}),
      }),
    );
    c.header("cache-control", "private, no-store");
    c.header("etag", `"${result.revision}"`);
    return c.json(result as unknown, 200);
  });
  app.openapi(list, async (c) => {
    const principal = c.get("principal"),
      query = c.req.valid("query");
    const data = await c.get("withTenantDatabase")((db) =>
      listPrompts(db, principal, {
        ...(query.search ? { search: query.search } : {}),
        ...(query.categoryId
          ? {
              categoryId: query.categoryId === "root" ? null : query.categoryId,
            }
          : {}),
        ...(query.cursor ? { offset: Number(query.cursor) } : {}),
        archived: query.archived === "true",
      }),
    );
    const [edit, promote, review, settings] = await Promise.all([
      canApiAction(c, "studio:write"),
      canApiAction(c, "prompt:promote"),
      canApiAction(c, "prompt:review"),
      canApiAction(c, "prompt:settings"),
    ]);
    return c.json(
      {
        ...data,
        environments: principal.environment
          ? data.environments.filter(
              (environment) => environment === principal.environment,
            )
          : data.environments,
        permissions: { edit, promote, review, settings },
      },
      200,
    );
  });
  app.openapi(detail, async (c) =>
    c.json(
      (await c.get("withTenantDatabase")((db) =>
        getPrompt(db, c.get("principal"), c.req.valid("param").id, {
          byKey: c.req.valid("query").lookup === "key",
          versionsOffset: Number(c.req.valid("query").versionsCursor ?? 0),
          ...(c.req.valid("query").version
            ? { version: c.req.valid("query").version! }
            : {}),
        }),
      )) as unknown,
      200,
    ),
  );
  app.openapi(tables, async (c) => {
    const scope = c.get("principal");
    const version = c.req.valid("query").version;
    const data = await c.get("withTenantDatabase")(async (db) => {
      const prompt = await getPrompt(db, scope, c.req.valid("param").id);
      if (version > prompt.asset.latestVersion)
        throw new PromptError(
          "PROMPT_NOT_FOUND",
          "Prompt version not found.",
          404,
        );
      const runIds = [
        ...new Set(
          prompt.usage
            .filter((item) => item.version === version)
            .map((item) => item.runId),
        ),
      ];
      const suiteRunIds = prompt.evidence
        .filter((item) => item.version === version)
        .map((item) => item.runId);
      const [runs, evaluations] = await Promise.all([
        listStudioRuns(db, {
          ...scope,
          runIds,
          query: {
            range: "All time",
            includeChildren: "true",
            pageSize: "100",
            ...(scope.environment ? { env: scope.environment } : {}),
          },
        }),
        listEvaluations(db, scope, { suiteRunIds }),
      ]);
      return {
        runs: runs.items,
        evaluations: StudioEvaluationSummarySchema.array().parse(evaluations),
      };
    });
    return c.json(data, 200);
  });
  app.openapi(mutate, async (c) => {
    const body = PromptMutationSchema.parse(c.req.valid("json")),
      principal = c.get("principal");
    await requireApiAction(
      c,
      body.action === "promote"
        ? "prompt:promote"
        : body.action === "review"
          ? "prompt:review"
          : body.action === "policy"
            ? "prompt:settings"
            : "studio:write",
    );
    if ("environment" in body)
      requirePrincipalEnvironment(principal, [body.environment]);
    if (body.action === "policy")
      requirePrincipalEnvironment(principal, [body.policy.environment]);
    const suiteRevisions: Record<string, string> = {};
    if (body.action === "promote") {
      const available = (
        adapter ? await adapter.list(principal) : targets
      ).filter(
        (target) =>
          target.organizationId === principal.organizationId &&
          target.projectId === principal.projectId &&
          target.environment === body.environment,
      );
      await Promise.all(
        available.map(async (target) => {
          try {
            const manifest = await (adapter
              ? adapter.manifest(target)
              : fetchEvalManifest(target));
            for (const suite of manifest.suites)
              suiteRevisions[JSON.stringify([target.id, suite.id])] =
                getEvalSuiteRevision(suite as EvalSuite);
          } catch {
            /* An unavailable consumer provides no current eligible suite. */
          }
        }),
      );
    }
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        mutatePrompt(
          db,
          principal,
          principalActorId(principal),
          body,
          body.action === "promote" ? { suiteRevisions } : undefined,
        ),
      ),
      200,
    );
  });
}
