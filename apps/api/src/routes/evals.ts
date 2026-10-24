import type { OpenAPIHono } from "@hono/zod-openapi";
import { type EvalJudge, getEvalSuiteRevision } from "@kortyx/agent";
import {
  createEvalIssue,
  EvalInspectionQuerySchema,
  EvalSettingsSchema,
  type EvalSuite,
  resolveEvalSettings,
  StudioEvalStartRequestSchema,
} from "@kortyx/agent/evals";
import {
  enqueueEvalRun,
  ensureProjectEnvironmentAllowed,
  getEvalLiveRun,
  getEvalLiveState,
  getEvalRun,
  getEvalSettings,
  inspectEvaluation,
  listEvalRuns,
  requestEvalCancellation,
  TelemetryForbiddenError,
  TelemetryNotFoundError,
} from "@kortyx/telemetry-db";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { EvalTargetAdapter } from "../evals/contracts";
import { snapshotEvalJudge } from "../evals/judge-snapshot";
import { freezeEvalPrompts } from "../evals/prompts";
import {
  evalInstallationSettings,
  registerEvalSettingsRoutes,
} from "../evals/settings";
import {
  EvalDiscoveryError,
  type EvalTarget,
  fetchEvalManifest,
} from "../evals/targets";
import {
  canApiAction,
  principalActorId,
  requireApiAction,
} from "../middleware/security";
import type { ApiEnv } from "../types";
import { registerEvaluationRoutes } from "./evaluations";

export function registerEvalRoutes(
  app: OpenAPIHono<ApiEnv>,
  targets: readonly EvalTarget[],
  studioJudge?: EvalJudge,
  adapter?: EvalTargetAdapter,
) {
  app.use("/v1/studio/evals/settings", bodyLimit({ maxSize: 16_384 }));
  registerEvalSettingsRoutes(app);
  registerEvaluationRoutes(app, targets, studioJudge, adapter);
  app.get("/v1/studio/evals/inspection/capabilities", (c) =>
    c.json({
      inspectionVersion: 1,
      views: ["overview", "attempts", "turn", "evidence"],
      maxPageSize: 100,
      maxContentLength: 32768,
    }),
  );
  app.get("/v1/studio/evals/inspection/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    const query = EvalInspectionQuerySchema.safeParse(c.req.query());
    if (!id.success || !query.success)
      return c.json({ error: "Invalid evaluation inspection query." }, 400);
    const result = await c.get("withTenantDatabase")((db) =>
      inspectEvaluation(db, c.get("principal"), id.data, query.data),
    );
    c.header("Cache-Control", "no-store");
    if (Buffer.byteLength(JSON.stringify(result)) > 512 * 1024)
      return c.json(
        {
          error:
            "Inspection page exceeds 512 KiB. Reduce limit or select a smaller evidence section.",
        },
        413,
      );
    return c.json(result);
  });
  const manifestFor = adapter
    ? (target: EvalTarget) => adapter.manifest(target)
    : fetchEvalManifest;
  app.use("/v1/studio/evals/runs", bodyLimit({ maxSize: 16_384 }));
  app.use("/v1/studio/evals/runs/*", bodyLimit({ maxSize: 16_384 }));
  app.get("/v1/studio/evals/capabilities", async (c) =>
    c.json({ canRun: await canApiAction(c, "eval:run") }),
  );
  app.get("/v1/studio/evals/targets", async (c) => {
    const auth = c.get("principal");
    const available = (adapter ? await adapter.list(auth) : targets).filter(
      (target) =>
        target.organizationId === auth.organizationId &&
        target.projectId === auth.projectId,
    );
    const items = await Promise.all(
      available.map(async (target) => {
        const base = {
          id: target.id,
          name: target.name,
          environment: target.environment,
        };
        try {
          await c.get("withTenantDatabase")((db) =>
            ensureProjectEnvironmentAllowed(db, target),
          );
        } catch (error) {
          return {
            ...base,
            manifest: null,
            revisions: {},
            error: createEvalIssue("execute", error).message,
            diagnostic: {
              code:
                error instanceof TelemetryForbiddenError
                  ? "environment_forbidden"
                  : "environment_unavailable",
            },
          };
        }
        try {
          const manifest = await manifestFor(target);
          return {
            ...base,
            manifest,
            revisions: Object.fromEntries(
              manifest.suites.map((suite) => [
                suite.id,
                getEvalSuiteRevision(suite as EvalSuite),
              ]),
            ),
            error: null,
            diagnostic: null,
          };
        } catch (error) {
          return {
            ...base,
            manifest: null,
            revisions: {},
            error: createEvalIssue("execute", error).message,
            diagnostic:
              error instanceof EvalDiscoveryError ? error.diagnostic : null,
          };
        }
      }),
    );
    return c.json({
      targets: items,
      settings: {
        defaults: await c.get("withTenantDatabase")((db) =>
          getEvalSettings(db, auth),
        ),
        ...evalInstallationSettings(),
        canEdit: await canApiAction(c, "studio:write"),
      },
      canRun: await canApiAction(c, "eval:run"),
      studioJudge: studioJudge
        ? {
            ...(studioJudge.instructions
              ? { instructions: studioJudge.instructions }
              : {}),
            ...(studioJudge.promptTemplates
              ? { promptTemplates: true as const }
              : {}),
            ...(studioJudge.prompt ? { prompt: studioJudge.prompt } : {}),
            id: studioJudge.id,
            version: studioJudge.version,
            location: "studio",
          }
        : null,
    });
  });
  app.get("/v1/studio/evals/runs", async (c) =>
    c.json({
      runs: await c.get("withTenantDatabase")((db) =>
        listEvalRuns(
          db,
          c.get("principal"),
          c.req.query("latestPerSuite") === "true",
        ),
      ),
    }),
  );
  app.get("/v1/studio/evals/runs/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid eval ID." }, 400);
    return c.json({
      run: await c.get("withTenantDatabase")((db) =>
        getEvalRun(db, c.get("principal"), id.data),
      ),
    });
  });
  app.get("/v1/studio/evals/runs/:id/live", async (c) => {
    c.header("Cache-Control", "no-store");
    const id = z.uuid().safeParse(c.req.param("id"));
    const after = c.req.query("after");
    if (!id.success || (after !== undefined && !/^[a-f0-9]{64}$/.test(after)))
      return c.json({ error: "Invalid eval live query." }, 400);
    if (after !== undefined) {
      const state = await c.get("withTenantDatabase")((db) =>
        getEvalLiveState(db, c.get("principal"), id.data),
      );
      return c.json({
        version: state.version,
        run: after === state.version ? null : state,
      });
    }
    return c.json({
      run: await c.get("withTenantDatabase")((db) =>
        getEvalLiveRun(db, c.get("principal"), id.data),
      ),
    });
  });
  app.get("/v1/studio/evals/runs/:id/case", async (c) => {
    c.header("Cache-Control", "no-store");
    const parsed = z
      .object({
        id: z.uuid(),
        caseId: z.string().min(1).max(200),
        repetition: z.coerce.number().int().min(1).max(20),
      })
      .safeParse({ ...c.req.query(), id: c.req.param("id") });
    if (!parsed.success)
      return c.json({ error: "Invalid eval case query." }, 400);
    return c.json({
      run: await c.get("withTenantDatabase")((db) =>
        getEvalRun(db, c.get("principal"), parsed.data.id, {
          caseId: parsed.data.caseId,
          repetition: parsed.data.repetition,
        }),
      ),
    });
  });
  app.post("/v1/studio/evals/runs", async (c) => {
    const auth = c.get("principal");
    await requireApiAction(c, "eval:run");
    const parsed = StudioEvalStartRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "Invalid eval request." }, 400);
    const { targetId, ...input } = parsed.data;
    const target = (adapter ? await adapter.list(auth) : targets).find(
      (value) =>
        value.id === targetId &&
        value.organizationId === auth.organizationId &&
        value.projectId === auth.projectId,
    );
    if (!target) throw new TelemetryNotFoundError("Eval target not found.");
    await c.get("withTenantDatabase")((db) =>
      ensureProjectEnvironmentAllowed(db, target),
    );
    let manifest: Awaited<ReturnType<typeof fetchEvalManifest>>;
    try {
      manifest = await manifestFor(target);
    } catch (error) {
      return c.json({ error: createEvalIssue("execute", error).message }, 503);
    }
    let resolvedSettings: ReturnType<typeof resolveEvalSettings>;
    try {
      const config = evalInstallationSettings();
      resolvedSettings = resolveEvalSettings(
        EvalSettingsSchema.parse(
          Object.fromEntries(
            Object.entries(input).filter(([key]) =>
              [
                "judge",
                "repetitions",
                "concurrency",
                "caseTimeoutMs",
                "gradingTimeoutMs",
                "runTimeoutMs",
              ].includes(key),
            ),
          ),
        ),
        await c.get("withTenantDatabase")((db) => getEvalSettings(db, auth)),
        manifest.execution,
        config.installation,
        config.maxRunTimeoutMs,
      );
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid evaluation settings.",
        },
        400,
      );
    }
    const request = { ...input, ...resolvedSettings.values };
    const suite = manifest.suites.find((value) => value.id === request.suiteId);
    if (
      !suite ||
      getEvalSuiteRevision(suite as EvalSuite) !== request.suiteRevision
    )
      return c.json({ error: "Suite changed. Refresh before running." }, 409);
    if (
      (request.caseIds &&
        (new Set(request.caseIds).size !== request.caseIds.length ||
          request.caseIds.some(
            (id) => !suite.cases.some((item) => item.id === id),
          ))) ||
      (request.caseIds?.length ?? suite.cases.length) * request.repetitions >
        100
    )
      return c.json({ error: "Invalid or oversized case selection." }, 400);
    const selectedJudge =
      request.judge === "studio"
        ? studioJudge && {
            ...(studioJudge.instructions
              ? { instructions: studioJudge.instructions }
              : {}),
            ...(studioJudge.promptTemplates
              ? { promptTemplates: true as const }
              : {}),
            ...(suite.judge?.prompt
              ? { prompt: suite.judge.prompt }
              : studioJudge.prompt
                ? { prompt: studioJudge.prompt }
                : {}),
            id: studioJudge.id,
            version: studioJudge.version,
            location: "studio" as const,
          }
        : (suite.judge ?? manifest.judge);
    if (
      request.judge === "studio" &&
      suite.judge?.prompt &&
      !studioJudge?.promptTemplates
    )
      return c.json(
        {
          error:
            "The configured Studio judge does not support suite prompt templates.",
        },
        409,
      );
    if (request.judge === "studio" && !manifest.studioJudging)
      return c.json(
        {
          error:
            "Update the consumer SDK to support Studio judging, or select App judge.",
        },
        409,
      );
    if (!selectedJudge)
      return c.json(
        {
          error:
            request.judge === "studio"
              ? "Studio judge is not configured. Configure a judge model and provider key on the Studio backend."
              : "This application has no code judge configured.",
        },
        503,
      );
    const { promptSnapshot, promptGroupName } = await freezeEvalPrompts(
      c.get("withTenantDatabase"),
      auth,
      target.environment,
      manifest.promptContracts,
      request.promptSelection,
    );
    const run = await c.get("withTenantDatabase")((db) =>
      enqueueEvalRun(db, {
        organizationId: auth.organizationId,
        projectId: auth.projectId,
        environment: target.environment,
        targetId,
        targetName: target.name,
        suiteId: suite.id,
        suiteRevision: request.suiteRevision,
        suite: suite as EvalSuite,
        request: {
          ...(promptSnapshot ? { promptSnapshot } : {}),
          ...(promptGroupName ? { promptGroupName } : {}),
          grading: request.judge,
          judge: snapshotEvalJudge(selectedJudge),
          suiteId: request.suiteId,
          suiteRevision: request.suiteRevision,
          repetitions: request.repetitions,
          concurrency: request.concurrency,
          runTimeoutMs: request.runTimeoutMs,
          ...(request.judge === "studio" ||
          manifest.execution?.overrides.includes("gradingTimeoutMs")
            ? { gradingTimeoutMs: request.gradingTimeoutMs }
            : {}),
          resolvedSettings,
          ...(manifest.execution?.overrides.includes("caseTimeoutMs")
            ? { caseTimeoutMs: request.caseTimeoutMs }
            : {}),
          ...(request.caseIds ? { caseIds: request.caseIds } : {}),
        },
        requestedBy:
          auth.kind === "api-key" ? auth.keyId : principalActorId(auth),
      }),
    );
    return c.json({ id: run.id }, 202);
  });
  app.post("/v1/studio/evals/runs/:id/cancel", async (c) => {
    const auth = c.get("principal");
    await requireApiAction(c, "eval:run");
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid eval ID." }, 400);
    if (adapter?.cancel) await adapter.cancel(auth, id.data);
    else
      await c.get("withTenantDatabase")((db) =>
        requestEvalCancellation(db, auth, id.data),
      );
    return c.json({ ok: true });
  });
}
