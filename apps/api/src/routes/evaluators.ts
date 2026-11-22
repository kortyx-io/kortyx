import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  DEFAULT_SCORE_GROUP_REF,
  EvaluatorDefinitionSchema,
  EvaluatorMetadataSchema,
  EvaluatorTargetSchema,
  ScoreGroupDefinitionSchema,
  ScoreGroupMetadataSchema,
} from "@kortyx/telemetry-contracts";
import {
  archiveEvaluator,
  archiveJudgeScoreGroup,
  captureEvaluatorEvidence,
  enqueueEvaluatorExecution,
  evaluatorVariables,
  getEvaluator,
  getEvaluatorDetail,
  getEvaluatorExecution,
  getJudgeScoreGroup,
  getJudgeScoreGroupVersion,
  listEvaluatorLibrary,
  listEvaluatorRecordings,
  listJudgeScoreGroups,
  publishEvaluator,
  publishedEvaluator,
  publishJudgeScoreGroup,
  renderEvaluatorMessages,
  resolveEvaluatorSnapshot,
  saveEvaluator,
  saveJudgeScoreGroup,
  updateEvaluatorMetadata,
  updateJudgeScoreGroupMetadata,
} from "@kortyx/telemetry-db";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { EvaluatorModelService } from "../evaluators/model";
import { canApiAction, requireApiAction } from "../middleware/security";
import type { ApiEnv } from "../types";

export function registerEvaluatorRoutes(
  app: OpenAPIHono<ApiEnv>,
  options: {
    models?: EvaluatorModelService | undefined;
    workerAvailable: boolean;
  },
) {
  const root = "/v1/studio/evaluators";
  app.use(root, bodyLimit({ maxSize: 65536 }));
  app.use(`${root}/*`, bodyLimit({ maxSize: 65536 }));
  app.get(`${root}/score-groups`, async (c) =>
    c.json({
      groups: await c.get("withTenantDatabase")((db) =>
        listJudgeScoreGroups(db, c.get("principal")),
      ),
      canEdit: await canApiAction(c, "studio:write"),
    }),
  );
  app.get(`${root}/score-groups/:groupId`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("groupId"));
    if (!id.success) return c.json({ error: "Invalid score-group ID." }, 400);
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        getJudgeScoreGroup(db, c.get("principal"), id.data),
      ),
    );
  });
  app.get(`${root}/score-groups/:groupId/versions/:version`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("groupId"));
    const version = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(c.req.param("version"));
    if (!id.success || !version.success)
      return c.json({ error: "Invalid score-group version." }, 400);
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        getJudgeScoreGroupVersion(
          db,
          c.get("principal"),
          { id: id.data, version: version.data },
          { allowArchived: true },
        ),
      ),
    );
  });
  app.post(`${root}/score-groups`, async (c) => {
    await requireApiAction(c, "studio:write");
    const input = ScoreGroupDefinitionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success)
      return c.json(
        { error: input.error.issues[0]?.message ?? "Check score fields." },
        400,
      );
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        saveJudgeScoreGroup(db, c.get("principal"), input.data),
      ),
      201,
    );
  });
  app.post(`${root}/score-groups/:groupId`, async (c) => {
    await requireApiAction(c, "studio:write");
    const id = z.uuid().safeParse(c.req.param("groupId"));
    const input = z
      .object({
        definition: ScoreGroupDefinitionSchema,
        revision: z.number().int().positive(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!id.success || !input.success)
      return c.json(
        {
          error: !input.success
            ? input.error.issues[0]?.message
            : "Invalid score-group ID.",
        },
        400,
      );
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        saveJudgeScoreGroup(
          db,
          c.get("principal"),
          input.data.definition,
          id.data,
          input.data.revision,
        ),
      ),
    );
  });
  app.post(`${root}/score-groups/:groupId/metadata`, async (c) => {
    await requireApiAction(c, "studio:write");
    const id = z.uuid().safeParse(c.req.param("groupId"));
    const input = ScoreGroupMetadataSchema.extend({
      revision: z.number().int().positive(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!id.success || !input.success)
      return c.json(
        {
          error: !input.success
            ? input.error.issues[0]?.message
            : "Invalid score-group ID.",
        },
        400,
      );
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        updateJudgeScoreGroupMetadata(
          db,
          c.get("principal"),
          id.data,
          input.data.revision,
          { name: input.data.name, description: input.data.description },
        ),
      ),
    );
  });
  app.post(
    `${root}/score-groups/:groupId/:action{publish|archive}`,
    async (c) => {
      await requireApiAction(c, "studio:write");
      const id = z.uuid().safeParse(c.req.param("groupId"));
      const input = z
        .object({ revision: z.number().int().positive() })
        .safeParse(await c.req.json().catch(() => null));
      if (!id.success || !input.success)
        return c.json({ error: "Invalid score-group revision." }, 400);
      return c.json(
        await c.get("withTenantDatabase")((db) =>
          c.req.param("action") === "publish"
            ? publishJudgeScoreGroup(
                db,
                c.get("principal"),
                id.data,
                input.data.revision,
              )
            : archiveJudgeScoreGroup(
                db,
                c.get("principal"),
                id.data,
                input.data.revision,
              ),
        ),
      );
    },
  );
  app.get(root, async (c) =>
    c.json({
      ...(await c.get("withTenantDatabase")((db) =>
        listEvaluatorLibrary(db, c.get("principal")),
      )),
      models: options.models?.models ?? [],
      workerAvailable: options.workerAvailable,
      canEdit: await canApiAction(c, "studio:write"),
      canRun: await canApiAction(c, "eval:run"),
    }),
  );
  app.post(root, async (c) => {
    await requireApiAction(c, "studio:write");
    const input = EvaluatorDefinitionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success)
      return c.json(
        {
          error: input.error.issues[0]?.message ?? "Check judge instructions.",
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
  app.get(`${root}/recordings`, async (c) => {
    const runId = z
      .string()
      .trim()
      .min(1)
      .max(512)
      .optional()
      .safeParse(c.req.query("runId"));
    if (!runId.success) return c.json({ error: "Invalid run ID." }, 400);
    return c.json({
      recordings: await c.get("withTenantDatabase")((db) =>
        listEvaluatorRecordings(db, c.get("principal"), runId.data),
      ),
    });
  });
  app.get(`${root}/executions/:executionId`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("executionId"));
    if (!id.success) return c.json({ error: "Invalid preview ID." }, 400);
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        getEvaluatorExecution(db, c.get("principal"), id.data),
      ),
    );
  });
  app.get(`${root}/:id`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid judge ID." }, 400);
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        getEvaluatorDetail(db, c.get("principal"), id.data),
      ),
    );
  });
  app.post(`${root}/:id`, async (c) => {
    await requireApiAction(c, "studio:write");
    const id = z.uuid().safeParse(c.req.param("id"));
    const input = z
      .object({
        definition: EvaluatorDefinitionSchema,
        revision: z.number().int().positive(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!id.success || !input.success)
      return c.json(
        {
          error: !input.success
            ? input.error.issues[0]?.message
            : "Invalid judge ID.",
        },
        400,
      );
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
  app.post(`${root}/:id/metadata`, async (c) => {
    await requireApiAction(c, "studio:write");
    const id = z.uuid().safeParse(c.req.param("id"));
    const input = EvaluatorMetadataSchema.extend({
      revision: z.number().int().positive(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!id.success || !input.success)
      return c.json(
        {
          error: !input.success
            ? input.error.issues[0]?.message
            : "Invalid judge ID.",
        },
        400,
      );
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        updateEvaluatorMetadata(
          db,
          c.get("principal"),
          id.data,
          input.data.revision,
          { name: input.data.name, description: input.data.description },
        ),
      ),
    );
  });
  app.post(`${root}/:id/:action{publish|archive}`, async (c) => {
    await requireApiAction(c, "studio:write");
    const id = z.uuid().safeParse(c.req.param("id"));
    const input = z
      .object({ revision: z.number().int().positive() })
      .safeParse(await c.req.json().catch(() => null));
    if (!id.success || !input.success)
      return c.json({ error: "Invalid version request." }, 400);
    return c.json(
      await c.get("withTenantDatabase")((db) =>
        c.req.param("action") === "archive"
          ? archiveEvaluator(
              db,
              c.get("principal"),
              id.data,
              input.data.revision,
            )
          : publishEvaluator(
              db,
              c.get("principal"),
              id.data,
              input.data.revision,
            ),
      ),
    );
  });
  app.post(`${root}/:id/:action{evidence|preview}`, async (c) => {
    const preview = c.req.param("action") === "preview";
    if (preview) await requireApiAction(c, "eval:run");
    const id = z.uuid().safeParse(c.req.param("id"));
    const input = z
      .object({
        target: EvaluatorTargetSchema,
        revision: z.number().int().positive().optional(),
        version: z.number().int().positive().optional(),
        requestKey: z.string().min(1).max(200).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!id.success || !input.success)
      return c.json(
        { error: "Select a recording and saved judge revision." },
        400,
      );
    if (preview && !options.workerAvailable)
      return c.json(
        {
          error:
            "Configure a judge model connection and preview worker before running previews.",
        },
        503,
      );
    if (!input.data.version && preview)
      await requireApiAction(c, "studio:write");
    return c.json(
      await c.get("withTenantDatabase")(async (db) => {
        const scope = c.get("principal");
        const asset = await getEvaluator(db, scope, id.data);
        if (asset.archived && preview)
          throw new HTTPException(400, {
            message: "Archived judges cannot run previews.",
          });
        if (!input.data.version && asset.revision !== input.data.revision)
          throw new HTTPException(409, {
            message: "Save and reload the draft before previewing.",
          });
        const snapshot = input.data.version
          ? await publishedEvaluator(db, scope, {
              id: id.data,
              version: input.data.version,
            })
          : resolveEvaluatorSnapshot(
              asset.draft,
              id.data,
              asset.revision,
              await getJudgeScoreGroupVersion(
                db,
                scope,
                asset.draft.scoreGroup ?? DEFAULT_SCORE_GROUP_REF,
              ),
            );
        if (preview) {
          if (!input.data.requestKey)
            throw new HTTPException(400, {
              message: "A preview request identity is required.",
            });
          if (!options.models?.models.includes(snapshot.definition.model))
            throw new HTTPException(400, {
              message: "The configured judge model is unavailable.",
            });
          return enqueueEvaluatorExecution(db, scope, {
            evaluatorId: id.data,
            evaluatorVersion: input.data.version ?? 0,
            snapshot,
            target: input.data.target,
            source: "preview",
            requestKey: input.data.requestKey,
          });
        }
        const evidence = await captureEvaluatorEvidence(
          db,
          scope,
          input.data.target,
          snapshot.definition.evidence,
        );
        return {
          evidence,
          variables: evaluatorVariables(evidence),
          messages: renderEvaluatorMessages(snapshot, evidence),
        };
      }),
      preview ? 202 : 200,
    );
  });
}
