import { type EvalSettings, EvalSettingsSchema } from "@kortyx/agent/evals";
import { and, eq } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryNotFoundError } from "../errors";
import { projects } from "../schema";

type Scope = { organizationId: string; projectId: string };
const where = (s: Scope) =>
  and(
    eq(projects.organizationId, s.organizationId),
    eq(projects.id, s.projectId),
  );
export async function getEvalSettings(
  db: TelemetryDb,
  scope: Scope,
): Promise<EvalSettings> {
  const [row] = await db
    .select({ defaults: projects.evalDefaults })
    .from(projects)
    .where(where(scope))
    .limit(1);
  if (!row) throw new TelemetryNotFoundError("Project not found.");
  return EvalSettingsSchema.parse(row.defaults);
}
export async function saveEvalSettings(
  db: TelemetryDb,
  scope: Scope,
  input: EvalSettings,
) {
  const defaults = EvalSettingsSchema.parse(input);
  const [row] = await db
    .update(projects)
    .set({ evalDefaults: defaults, updatedAt: new Date() })
    .where(where(scope))
    .returning({ defaults: projects.evalDefaults });
  if (!row) throw new TelemetryNotFoundError("Project not found.");
  return row.defaults;
}
