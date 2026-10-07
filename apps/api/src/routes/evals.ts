import type { OpenAPIHono } from "@hono/zod-openapi";
import { type EvalJudge, getEvalSuiteRevision } from "@kortyx/agent";
import {
  type EvalSuite,
  StudioEvalStartRequestSchema,
} from "@kortyx/agent/evals";
import {
  enqueueEvalRun,
  ensureProjectEnvironmentAllowed,
  getEvalRun,
  listEvalRuns,
  requestEvalCancellation,
  TelemetryForbiddenError,
  TelemetryNotFoundError,
} from "@kortyx/telemetry-db";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { EvalTargetAdapter } from "../evals/contracts";
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

export function registerEvalRoutes(
  app: OpenAPIHono<ApiEnv>,
  targets: readonly EvalTarget[],
  studioJudge?: EvalJudge,
  adapter?: EvalTargetAdapter,
) {
  const manifestFor = adapter
    ? (target: EvalTarget) => adapter.manifest(target)
    : fetchEvalManifest;
  app.use("/v1/studio/evals/runs", bodyLimit({ maxSize: 16_384 }));
  app.use("/v1/studio/evals/runs/*", bodyLimit({ maxSize: 16_384 }));
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
            error: "Consumer eval environment is unavailable.",
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
            error: "Consumer eval endpoint is unavailable or incompatible.",
            diagnostic:
              error instanceof EvalDiscoveryError ? error.diagnostic : null,
          };
        }
      }),
    );
    return c.json({
      targets: items,
      canRun: await canApiAction(c, "eval:run"),
      studioJudge: studioJudge
        ? {
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
        listEvalRuns(db, c.get("principal")),
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
  app.post("/v1/studio/evals/runs", async (c) => {
    const auth = c.get("principal");
    await requireApiAction(c, "eval:run");
    const parsed = StudioEvalStartRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "Invalid eval request." }, 400);
    const { targetId, ...request } = parsed.data;
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
    } catch {
      return c.json({ error: "Consumer eval endpoint is unavailable." }, 503);
    }
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
            id: studioJudge.id,
            version: studioJudge.version,
            location: "studio" as const,
          }
        : manifest.judge;
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
          grading: request.judge,
          judge: {
            id: selectedJudge.id,
            version: selectedJudge.version,
            ...(selectedJudge.location
              ? { location: selectedJudge.location }
              : {}),
          },
          suiteId: request.suiteId,
          suiteRevision: request.suiteRevision,
          repetitions: request.repetitions,
          concurrency: request.concurrency,
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
