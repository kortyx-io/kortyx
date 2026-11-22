import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  EvaluatorDefinitionSchema,
  EvaluatorRuleDefinitionSchema,
  EvaluatorTargetSchema,
} from "@kortyx/telemetry-contracts";
import {
  archiveEvaluator,
  captureEvaluatorEvidence,
  createScoreGroup,
  createScoreGroupVersion,
  datasetEvaluatorDefaults,
  enqueueEvaluatorExecution,
  getEvaluator,
  getEvaluatorDetail,
  getEvaluatorExecution,
  listEvaluatorLibrary,
  listEvaluatorRecordings,
  listEvaluatorScores,
  matchingRuleRuns,
  publishEvaluator,
  publishedEvaluator,
  renderEvaluatorMessages,
  resolveEvaluatorSnapshot,
  saveEvaluator,
  saveEvaluatorRule,
  setEvaluatorDataset,
} from "@kortyx/telemetry-db";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { EvalTargetAdapter } from "../evals/contracts";
import type { EvalTarget } from "../evals/targets";
import { fetchEvalManifest } from "../evals/targets";
import type { EvaluatorModelService } from "../evaluators/model";
import {
  canApiAction,
  requireApiAction,
  requirePrincipalEnvironment,
} from "../middleware/security";
import type { ApiEnv } from "../types";

export function registerEvaluatorRoutes(
  app: OpenAPIHono<ApiEnv>,
  options: {
    models?: EvaluatorModelService | undefined;
    workerAvailable: boolean;
    targets: readonly EvalTarget[];
    targetAdapter?: EvalTargetAdapter | undefined;
  },
) {
  const root = "/v1/studio/evaluators";
  app.use(`${root}/*`, bodyLimit({ maxSize: 65536 }));
  app.use(root, bodyLimit({ maxSize: 65536 }));
  app.get(root, async (c) => {
    const data = await c.get("withTenantDatabase")((db) =>
      listEvaluatorLibrary(db, c.get("principal")),
    );
    return c.json({
      ...data,
      models: options.models?.models ?? [],
      workerAvailable: options.workerAvailable,
      canEdit: await canApiAction(c, "studio:write"),
      canRun: await canApiAction(c, "eval:run"),
    });
  });
  app.post(root, async (c) => {
    await requireApiAction(c, "studio:write");
    const input = EvaluatorDefinitionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success)
      return c.json(
        {
          error: "Invalid evaluator configuration.",
          details: input.error.flatten(),
        },
        400,
      );
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        saveEvaluator(db, c.get("principal"), input.data),
      ),
      201,
    );
  });
  app.get(`${root}/recordings`, async (c) =>
    c.json({
      recordings: await c.get("withTenantDatabase")((db) =>
        listEvaluatorRecordings(db, c.get("principal")),
      ),
    }),
  );
  app.get(`${root}/scores`, async (c) =>
    c.json({
      executions: await c.get("withTenantDatabase")((db) =>
        listEvaluatorScores(
          db,
          c.get("principal"),
          c.req.query("runId"),
          c.req.query("evalRunId"),
        ),
      ),
    }),
  );
  app.post(`${root}/:id/evidence`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    const input = z
      .object({
        target: EvaluatorTargetSchema,
        revision: z.number().int().positive(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!id.success || !input.success)
      return c.json({ error: "Select a recorded target." }, 400);
    return c.json(
      await c.get("withTenantDatabase")(async (db) => {
        const evaluator = await getEvaluator(db, c.get("principal"), id.data);
        if (evaluator.revision !== input.data.revision)
          throw new HTTPException(409, {
            message:
              "Save and reload the current draft before inspecting evidence.",
          });
        const snapshot = await resolveEvaluatorSnapshot(
          db,
          c.get("principal"),
          evaluator.draft,
        );
        const evidence = await captureEvaluatorEvidence(
          db,
          c.get("principal"),
          input.data.target,
          snapshot.definition.evidence,
        );
        return {
          evidence,
          messages: renderEvaluatorMessages(snapshot, evidence),
          scoreGroup: snapshot.group,
        };
      }),
    );
  });
  app.on(
    "POST",
    [
      `${root}/score-groups/:groupId/versions`,
      "/v1/studio/score-groups/:groupId/versions",
    ],
    bodyLimit({ maxSize: 65536 }),
    async (c: Context<ApiEnv>) => {
      await requireApiAction(c, "studio:write");
      const id = z.uuid().safeParse(c.req.param("groupId"));
      const body = z
        .object({
          baseVersion: z.number().int().positive(),
          definition: z.unknown(),
        })
        .safeParse(await c.req.json().catch(() => null));
      if (!id.success || !body.success)
        return c.json(
          { error: "Select a group and its current version." },
          400,
        );
      return c.json(
        await c.get("withTenantDatabase")((db) =>
          createScoreGroupVersion(
            db,
            c.get("principal"),
            id.data,
            body.data.baseVersion,
            body.data.definition,
          ),
        ),
        201,
      );
    },
  );
  app.get("/v1/studio/score-groups", async (c) =>
    c.json({
      scoreGroups: (
        await c.get("withTenantDatabase")((db) =>
          listEvaluatorLibrary(db, c.get("principal")),
        )
      ).scoreGroups,
    }),
  );
  app.post(
    "/v1/studio/score-groups",
    bodyLimit({ maxSize: 65536 }),
    async (c) => {
      await requireApiAction(c, "studio:write");
      const body = await c.req.json().catch(() => null);
      return c.json(
        await c.get("withTenantDatabase")((db) =>
          createScoreGroup(db, c.get("principal"), body),
        ),
        201,
      );
    },
  );
  app.post(`${root}/score-groups`, async (c) => {
    await requireApiAction(c, "studio:write");
    const input = await c.req.json().catch(() => null);
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        createScoreGroup(db, c.get("principal"), input),
      ),
      201,
    );
  });
  app.get(`${root}/dataset-defaults`, async (c) => {
    const targetId = c.req.query("targetId") ?? "";
    return c.json({
      bindings: await c.get("withTenantDatabase")((db) =>
        datasetEvaluatorDefaults(
          db,
          c.get("principal"),
          targetId,
          (c.req.query("suiteIds") ?? "").split(",").slice(0, 100),
        ),
      ),
    });
  });
  app.get(`${root}/executions/:executionId`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("executionId"));
    if (!id.success) return c.json({ error: "Invalid execution ID." }, 400);
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        getEvaluatorExecution(db, c.get("principal"), id.data),
      ),
    );
  });
  app.get(`${root}/:id`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid evaluator ID." }, 400);
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        getEvaluatorDetail(db, c.get("principal"), id.data),
      ),
    );
  });
  app.post(`${root}/:id`, async (c) => {
    await requireApiAction(c, "studio:write");
    const input = z
      .object({
        definition: EvaluatorDefinitionSchema,
        revision: z.number().int().positive(),
      })
      .safeParse(await c.req.json().catch(() => null));
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!input.success || !id.success)
      return c.json({ error: "Invalid draft request." }, 400);
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        saveEvaluator(
          db,
          c.get("principal"),
          input.data.definition,
          id.data,
          input.data.revision,
        ),
      ),
    );
  });
  app.post(`${root}/:id/:action{publish|archive}`, async (c) => {
    await requireApiAction(c, "studio:write");
    const input = z
      .object({ revision: z.number().int().positive() })
      .safeParse(await c.req.json().catch(() => null));
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!input.success || !id.success)
      return c.json({ error: "Invalid publication request." }, 400);
    return c.json(
      await c.get("withTenantDatabase")(async (db) => {
        if (c.req.param("action") === "archive")
          return archiveEvaluator(
            db,
            c.get("principal"),
            id.data,
            input.data.revision,
          );
        const asset = await getEvaluator(db, c.get("principal"), id.data);
        if (!options.models?.models.includes(asset.draft.model))
          throw new HTTPException(400, {
            message: "Configure this evaluator model before publishing.",
          });
        return publishEvaluator(
          db,
          c.get("principal"),
          id.data,
          input.data.revision,
        );
      }),
    );
  });
  app.post(`${root}/:id/:action{preview|evaluate}`, async (c) => {
    await requireApiAction(c, "eval:run");
    if (!options.workerAvailable)
      return c.json(
        {
          error:
            "An evaluator worker and model connection must be configured before running assessments.",
        },
        503,
      );
    const input = z
      .object({
        target: EvaluatorTargetSchema,
        version: z.number().int().positive().optional(),
        revision: z.number().int().positive().optional(),
        requestKey: z.string().min(1).max(200),
      })
      .safeParse(await c.req.json().catch(() => null));
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!input.success || !id.success)
      return c.json(
        { error: "Select a recorded run or a saved experiment case." },
        400,
      );
    if (c.req.param("action") === "preview")
      await requireApiAction(c, "studio:write");
    return c.json(
      await c.get("withTenantDatabase")(async (db) => {
        const scope = c.get("principal");
        const asset = await getEvaluator(db, scope, id.data);
        const preview = c.req.param("action") === "preview";
        if (
          preview &&
          (asset.archived || asset.revision !== input.data.revision)
        )
          throw new HTTPException(409, {
            message: "Save and reload the current draft before previewing.",
          });
        const ref = {
          id: id.data,
          version: input.data.version ?? asset.publishedVersion,
        };
        const snapshot = preview
          ? await resolveEvaluatorSnapshot(db, scope, asset.draft)
          : await publishedEvaluator(db, scope, ref);
        if (!options.models?.models.includes(snapshot.definition.model))
          throw new HTTPException(400, { message: "Model is unavailable." });
        return enqueueEvaluatorExecution(db, scope, {
          evaluatorId: id.data,
          evaluatorVersion: preview ? 0 : ref.version,
          snapshot,
          target: input.data.target,
          source: preview ? "preview" : "manual",
          requestKey: input.data.requestKey,
        });
      }),
      202,
    );
  });
  app.post(`${root}/:id/rules/preview`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    const input = EvaluatorRuleDefinitionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!id.success || !input.success)
      return c.json({ error: "Invalid rule." }, 400);
    requirePrincipalEnvironment(c.get("principal"), [input.data.environment]);
    return c.json(
      await c.get("withTenantDatabase")(async (db) => {
        await getEvaluator(db, c.get("principal"), id.data);
        const matches = await matchingRuleRuns(
          db,
          c.get("principal"),
          input.data,
          new Date(Date.now() - 86400000),
        );
        return {
          window: "Last 24 hours, up to 20 matching runs",
          matches: matches.map((r) => ({
            runId: r.runId,
            environment: r.environment,
            status: r.status,
          })),
          sampleRate: input.data.sampleRate,
          dailyLimit: input.data.dailyLimit,
        };
      }),
    );
  });
  app.post(`${root}/:id/rules`, async (c) => {
    await requireApiAction(c, "studio:write");
    await requireApiAction(c, "eval:run");
    const id = z.uuid().safeParse(c.req.param("id"));
    const input = z
      .object({
        definition: EvaluatorRuleDefinitionSchema,
        creationId: z.uuid().optional(),
        id: z.uuid().optional(),
        revision: z.number().int().positive().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!id.success || !input.success)
      return c.json({ error: "Invalid rule." }, 400);
    requirePrincipalEnvironment(c.get("principal"), [
      input.data.definition.environment,
    ]);
    if (input.data.definition.enabled && !options.workerAvailable)
      return c.json(
        { error: "Configure the evaluator worker before activating rules." },
        503,
      );
    return c.json(
      await c.get("withTenantDatabase")(async (db) => {
        await publishedEvaluator(db, c.get("principal"), {
          id: id.data,
          version: input.data.definition.evaluatorVersion,
        });
        return saveEvaluatorRule(
          db,
          c.get("principal"),
          id.data,
          input.data.definition,
          input.data.id,
          input.data.revision,
          input.data.creationId,
        );
      }),
    );
  });
  app.post(`${root}/:id/datasets`, async (c) => {
    await requireApiAction(c, "studio:write");
    const id = z.uuid().safeParse(c.req.param("id"));
    const input = z
      .object({
        targetId: z.string().min(1),
        suiteId: z.string().min(1),
        version: z.number().int().positive(),
        enabled: z.boolean(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success || !id.success)
      return c.json({ error: "Invalid dataset selection." }, 400);
    const principal = c.get("principal");
    const target = (
      options.targetAdapter
        ? await options.targetAdapter.list(principal)
        : options.targets
    ).find(
      (t) =>
        t.id === input.data.targetId &&
        t.organizationId === principal.organizationId &&
        t.projectId === principal.projectId,
    );
    if (!target) return c.json({ error: "Dataset target not found." }, 404);
    requirePrincipalEnvironment(principal, [target.environment]);
    if (input.data.enabled) {
      const manifest = await (options.targetAdapter
        ? options.targetAdapter.manifest(target)
        : fetchEvalManifest(target));
      if (!manifest.suites.some((s) => s.id === input.data.suiteId))
        return c.json({ error: "Dataset not found." }, 404);
    }
    await c.get("withTenantDatabase")((db) =>
      setEvaluatorDataset(
        db,
        principal,
        { id: id.data, version: input.data.version },
        input.data.targetId,
        input.data.suiteId,
        input.data.enabled,
      ),
    );
    return c.json({ ok: true });
  });
}
