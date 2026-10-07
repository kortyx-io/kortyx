import type { OpenAPIHono } from "@hono/zod-openapi";
import { type EvalJudge, getEvalSuiteRevision } from "@kortyx/agent";
import {
  type EvalSuite,
  StudioEvaluationStartRequestSchema,
} from "@kortyx/agent/evals";
import {
  cancelEvaluation,
  enqueueEvaluation,
  ensureProjectEnvironmentAllowed,
  evaluationRequestHash,
  findIdempotentEvaluation,
  getEvaluation,
  listEvaluations,
  TelemetryNotFoundError,
  TelemetryValidationError,
} from "@kortyx/telemetry-db";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { EvalTargetAdapter } from "../evals/contracts";
import { type EvalTarget, fetchEvalManifest } from "../evals/targets";
import {
  principalActorId,
  requireApiAction,
  requirePrincipalEnvironment,
} from "../middleware/security";
import type { ApiEnv } from "../types";

export function registerEvaluationRoutes(
  app: OpenAPIHono<ApiEnv>,
  targets: readonly EvalTarget[],
  studioJudge?: EvalJudge,
  adapter?: EvalTargetAdapter,
) {
  const path = "/v1/studio/evals/evaluations";
  app.use(path, bodyLimit({ maxSize: 16_384 }));
  app.use(`${path}/*`, bodyLimit({ maxSize: 16_384 }));
  app.get(path, async (c) =>
    c.json({
      runs: await c.get("withTenantDatabase")((db) =>
        listEvaluations(db, c.get("principal")),
      ),
    }),
  );
  app.get(`${path}/:id`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid evaluation ID." }, 400);
    return c.json({
      run: await c.get("withTenantDatabase")((db) =>
        getEvaluation(db, c.get("principal"), id.data),
      ),
    });
  });
  app.get(`${path}/:id/results`, async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid evaluation ID." }, 400);
    return c.json({
      run: await c.get("withTenantDatabase")((db) =>
        getEvaluation(db, c.get("principal"), id.data, true),
      ),
    });
  });
  app.post(path, async (c) => {
    await requireApiAction(c, "eval:run");
    const parsed = StudioEvaluationStartRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json({ error: "Invalid evaluation request." }, 400);
    const request = parsed.data;
    const auth = c.get("principal");
    const target = (adapter ? await adapter.list(auth) : targets).find(
      (target) =>
        target.id === request.targetId &&
        target.organizationId === auth.organizationId &&
        target.projectId === auth.projectId,
    );
    if (!target) throw new TelemetryNotFoundError("Eval target not found.");
    requirePrincipalEnvironment(auth, [target.environment]);
    await c.get("withTenantDatabase")((db) =>
      ensureProjectEnvironmentAllowed(db, target),
    );
    const hash = evaluationRequestHash({
      ...request,
      suites: [...request.suites].sort((a, b) =>
        a.suiteId.localeCompare(b.suiteId),
      ),
    });
    try {
      if (request.idempotencyKey) {
        const existing = await c.get("withTenantDatabase")((db) =>
          findIdempotentEvaluation(db, auth, request.idempotencyKey!, hash),
        );
        if (existing) return c.json({ id: existing.id }, 200);
      }
      let manifest: Awaited<ReturnType<typeof fetchEvalManifest>>;
      try {
        manifest = await (adapter
          ? adapter.manifest(target)
          : fetchEvalManifest(target));
      } catch {
        return c.json({ error: "Consumer eval endpoint is unavailable." }, 503);
      }
      const selected = request.suites.map((selection) => ({
        selection,
        suite: manifest.suites.find((suite) => suite.id === selection.suiteId),
      }));
      if (
        new Set(request.suites.map((s) => s.suiteId)).size !==
        request.suites.length
      )
        return c.json({ error: "Select each suite once." }, 400);
      if (
        selected.some(
          ({ selection, suite }) =>
            !suite ||
            getEvalSuiteRevision(suite as EvalSuite) !==
              selection.suiteRevision,
        )
      )
        return c.json({ error: "Suite changed. Refresh before running." }, 409);
      if (
        request.selection === "all" &&
        (request.suites.length !== manifest.suites.length ||
          request.suites.some((s) => s.caseIds !== undefined))
      )
        return c.json(
          {
            error:
              "All suites must include the complete discovered suite and case selection.",
          },
          409,
        );
      if (
        selected.length > 1 &&
        selected.some(({ selection }) => selection.caseIds !== undefined)
      )
        return c.json(
          { error: "Case selection requires exactly one suite." },
          400,
        );
      let attempts = 0;
      for (const { selection, suite } of selected) {
        const ids = selection.caseIds ?? suite!.cases.map((item) => item.id);
        const count = ids.length * request.repetitions;
        if (
          !ids.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !suite!.cases.some((item) => item.id === id)) ||
          count > 100
        )
          return c.json(
            {
              error:
                "Select unique existing cases and at most 100 attempts per suite.",
            },
            400,
          );
        attempts += count;
      }
      if (attempts > 1000)
        return c.json(
          { error: "An evaluation supports at most 1,000 total attempts." },
          400,
        );
      const judge =
        request.judge === "studio"
          ? studioJudge && {
              id: studioJudge.id,
              version: studioJudge.version,
              location: "studio" as const,
            }
          : manifest.judge;
      if (request.judge === "studio" && !manifest.studioJudging)
        return c.json(
          { error: "Update the consumer SDK to support Studio judging." },
          409,
        );
      if (!judge)
        return c.json(
          {
            error:
              request.judge === "app"
                ? "No App judge configured by this application."
                : "Studio judge is not configured.",
          },
          503,
        );
      const requestedBy =
        auth.kind === "api-key" ? auth.keyId : principalActorId(auth);
      const scope = {
        organizationId: auth.organizationId,
        projectId: auth.projectId,
        environment: target.environment,
        targetId: target.id,
        targetName: target.name,
        requestedBy,
      };
      const parent = await c.get("withTenantDatabase")((db) =>
        enqueueEvaluation(
          db,
          {
            ...scope,
            name:
              request.name ??
              (request.selection === "all"
                ? "All suites"
                : selected.length === 1
                  ? (selected[0]!.suite!.name ?? selected[0]!.suite!.id)
                  : `${selected.length} selected suites`),
            request: request as Parameters<
              typeof enqueueEvaluation
            >[1]["request"],
            requestHash: hash,
            idempotencyKey: request.idempotencyKey,
          },
          selected.map(({ selection, suite }) => ({
            ...scope,
            suiteId: suite!.id,
            suiteRevision: selection.suiteRevision,
            suite: suite as EvalSuite,
            request: {
              suiteId: suite!.id,
              suiteRevision: selection.suiteRevision,
              grading: request.judge,
              judge: {
                id: judge.id,
                version: judge.version,
                ...(judge.location ? { location: judge.location } : {}),
              },
              repetitions: request.repetitions,
              concurrency: request.concurrency,
              ...(selection.caseIds ? { caseIds: selection.caseIds } : {}),
            },
          })),
        ),
      );
      return c.json({ id: parent.id }, 202);
    } catch (error) {
      if (error instanceof TelemetryValidationError)
        return c.json({ error: error.message }, 409);
      throw error;
    }
  });
  app.post(`${path}/:id/cancel`, async (c) => {
    await requireApiAction(c, "eval:run");
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid evaluation ID." }, 400);
    const auth = c.get("principal");
    const children = adapter?.cancel
      ? (
          await c.get("withTenantDatabase")((db) =>
            getEvaluation(db, auth, id.data),
          )
        ).suites
      : [];
    await c.get("withTenantDatabase")((db) =>
      cancelEvaluation(db, c.get("principal"), id.data),
    );
    if (adapter?.cancel)
      await Promise.all(
        children
          .filter((run) => run.status === "queued" || run.status === "running")
          .map((run) => adapter.cancel!(auth, run.id)),
      );
    return c.json({ ok: true });
  });
}
