import type { OpenAPIHono } from "@hono/zod-openapi";
import { type EvalSettings, EvalSettingsSchema } from "@kortyx/agent/evals";
import { getEvalSettings, saveEvalSettings } from "@kortyx/telemetry-db";
import { canApiAction, requireApiAction } from "../middleware/security";
import type { ApiEnv } from "../types";

export function evalInstallationSettings(env: NodeJS.ProcessEnv = process.env) {
  const installation: EvalSettings = {};
  if (env.KORTYX_EVAL_RUN_TIMEOUT_MS !== undefined)
    installation.runTimeoutMs = Number(env.KORTYX_EVAL_RUN_TIMEOUT_MS);
  if (env.KORTYX_EVAL_GRADING_TIMEOUT_MS !== undefined)
    installation.gradingTimeoutMs = Number(env.KORTYX_EVAL_GRADING_TIMEOUT_MS);
  EvalSettingsSchema.parse(installation);
  const maxRunTimeoutMs = Number(
    env.KORTYX_EVAL_MAX_RUN_TIMEOUT_MS ?? 2_147_483_647,
  );
  EvalSettingsSchema.shape.runTimeoutMs.unwrap().parse(maxRunTimeoutMs);
  if ((installation.runTimeoutMs ?? 1_800_000) > maxRunTimeoutMs)
    throw new Error(
      "Evaluation default exceeds KORTYX_EVAL_MAX_RUN_TIMEOUT_MS.",
    );
  return { installation, maxRunTimeoutMs };
}
export function registerEvalSettingsRoutes(app: OpenAPIHono<ApiEnv>) {
  const installation = evalInstallationSettings();
  app.get("/v1/studio/evals/settings", async (c) =>
    c.json({
      defaults: await c.get("withTenantDatabase")((db) =>
        getEvalSettings(db, c.get("principal")),
      ),
      ...installation,
      canEdit: await canApiAction(c, "studio:write"),
    }),
  );
  app.post("/v1/studio/evals/settings", async (c) => {
    await requireApiAction(c, "studio:write");
    const parsed = EvalSettingsSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json(
        {
          error:
            "Invalid evaluation defaults. Use positive integers within the supported limits.",
        },
        400,
      );
    if (
      (parsed.data.runTimeoutMs ??
        installation.installation.runTimeoutMs ??
        1_800_000) > installation.maxRunTimeoutMs
    )
      return c.json(
        {
          error: `Evaluation timeout exceeds the administrator maximum of ${installation.maxRunTimeoutMs} ms.`,
        },
        400,
      );
    const defaults = await c.get("withTenantDatabase")((db) =>
      saveEvalSettings(db, c.get("principal"), parsed.data),
    );
    return c.json({ defaults, ...installation, canEdit: true });
  });
}
