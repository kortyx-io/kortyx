import type { OpenAPIHono } from "@hono/zod-openapi";
import type { EvalGradeInput, EvalJudge } from "@kortyx/agent";
import {
  EvalVerdictSchema,
  StudioEvalJudgeRequestSchema,
} from "@kortyx/agent/evals";
import { ensureProjectEnvironmentAllowed } from "@kortyx/telemetry-db";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { requireApiAction } from "../middleware/security";
import type { ApiEnv } from "../types";

export function registerEvalJudgeRoutes(
  app: OpenAPIHono<ApiEnv>,
  judge?: EvalJudge,
) {
  const path = "/v1/studio/evals/judge";
  const identity = judge
    ? { id: judge.id, version: judge.version, location: "studio" as const }
    : undefined;
  let active = 0;
  app.use(path, bodyLimit({ maxSize: 2_000_000 }));
  app.use(path, async (c, next) => {
    await requireApiAction(c, "eval:run");
    await next();
  });
  app.get(path, async (c) => {
    const environment = z
      .string()
      .trim()
      .min(1)
      .max(256)
      .safeParse(c.req.query("environment"));
    if (!environment.success)
      return c.json({ error: "An eval environment is required." }, 400);
    await c.get("withTenantDatabase")((db) =>
      ensureProjectEnvironmentAllowed(db, {
        ...c.get("principal"),
        environment: environment.data,
      }),
    );
    if (!identity)
      return c.json({ error: "Studio judge is not configured." }, 503);
    return c.json(identity);
  });
  app.post(path, async (c) => {
    const input = StudioEvalJudgeRequestSchema.safeParse(
      await c.req.json().catch((error: unknown) => {
        if (error instanceof SyntaxError) return null;
        throw error;
      }),
    );
    if (!input.success) return c.json({ error: "Invalid judge request." }, 400);
    await c.get("withTenantDatabase")((db) =>
      ensureProjectEnvironmentAllowed(db, {
        ...c.get("principal"),
        environment: input.data.environment,
      }),
    );
    if (!judge || !identity)
      return c.json({ error: "Studio judge is not configured." }, 503);
    if (
      input.data.judge.id !== identity.id ||
      input.data.judge.version !== identity.version ||
      input.data.judge.location !== "studio"
    )
      return c.json(
        { error: "Studio judge changed. Refresh before running." },
        409,
      );
    if (active >= 4) return c.json({ error: "Studio judge is busy." }, 429);
    active++;
    try {
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(60_000),
      ]);
      signal.throwIfAborted();
      const { environment: _environment, judge: _judge, ...grade } = input.data;
      const usage: import("@kortyx/agent/evals").EvalJudgeUsage[] = [];
      const verdict = EvalVerdictSchema.parse(
        await judge.grade({
          ...grade,
          signal,
          onUsage: (record) => usage.push(record),
        } as EvalGradeInput),
      );
      signal.throwIfAborted();
      return c.json({
        judge: identity,
        verdict,
        ...(usage.length ? { usage } : {}),
      });
    } catch {
      // Provider errors can contain credentials and transport details.
      return c.json(
        { error: "Studio grading failed or returned an invalid verdict." },
        502,
      );
    } finally {
      active--;
    }
  });
}
