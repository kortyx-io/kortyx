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
import { type EvalTarget, fetchEvalManifest } from "../evals/targets";
import type { ApiEnv } from "../types";

export function registerEvalRoutes(
  app: OpenAPIHono<ApiEnv>,
  targets: readonly EvalTarget[],
  studioJudge?: EvalJudge,
) {
  app.use("/v1/studio/evals/runs", bodyLimit({ maxSize: 16_384 }));
  app.use("/v1/studio/evals/runs/*", bodyLimit({ maxSize: 16_384 }));
  app.get("/v1/studio/evals/targets", async (c) => {
    const auth = c.get("auth");
    const available = targets.filter(
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
          await ensureProjectEnvironmentAllowed(c.get("db"), target);
          const manifest = await fetchEvalManifest(target);
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
          };
        } catch {
          return {
            ...base,
            manifest: null,
            revisions: {},
            error: "Consumer eval endpoint is unavailable or incompatible.",
          };
        }
      }),
    );
    return c.json({
      targets: items,
      canRun: auth.scopes.includes("eval:run"),
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
    c.json({ runs: await listEvalRuns(c.get("db"), c.get("auth")) }),
  );
  app.get("/v1/studio/evals/runs/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid eval ID." }, 400);
    return c.json({
      run: await getEvalRun(c.get("db"), c.get("auth"), id.data),
    });
  });
  app.post("/v1/studio/evals/runs", async (c) => {
    const auth = c.get("auth");
    if (!auth.scopes.includes("eval:run"))
      throw new TelemetryForbiddenError(
        "Eval execution requires eval:run scope.",
      );
    const parsed = StudioEvalStartRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "Invalid eval request." }, 400);
    const { targetId, ...request } = parsed.data;
    const target = targets.find(
      (value) =>
        value.id === targetId &&
        value.organizationId === auth.organizationId &&
        value.projectId === auth.projectId,
    );
    if (!target) throw new TelemetryNotFoundError("Eval target not found.");
    await ensureProjectEnvironmentAllowed(c.get("db"), target);
    let manifest: Awaited<ReturnType<typeof fetchEvalManifest>>;
    try {
      manifest = await fetchEvalManifest(target);
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
    const run = await enqueueEvalRun(c.get("db"), {
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
      requestedBy: auth.keyId,
    });
    return c.json({ id: run.id }, 202);
  });
  app.post("/v1/studio/evals/runs/:id/cancel", async (c) => {
    const auth = c.get("auth");
    if (!auth.scopes.includes("eval:run"))
      throw new TelemetryForbiddenError(
        "Eval cancellation requires eval:run scope.",
      );
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid eval ID." }, 400);
    await requestEvalCancellation(c.get("db"), auth, id.data);
    return c.json({ ok: true });
  });
}
