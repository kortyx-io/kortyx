import { randomUUID } from "node:crypto";
import type {
  StudioChange,
  StudioChangeResource,
} from "@kortyx/telemetry-contracts";
import { sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";

export const STUDIO_CHANGE_CHANNEL = "kortyx_studio_changes";

export const notifyStudioChange = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    resources: readonly StudioChangeResource[];
  },
): Promise<StudioChange> => {
  const change: StudioChange = {
    schemaVersion: 1,
    changeId: randomUUID(),
    emittedAt: new Date().toISOString(),
    organizationId: input.organizationId,
    projectId: input.projectId,
    resources: [...new Set(input.resources)].sort(),
  };

  await db.execute(
    sql`select pg_notify(${STUDIO_CHANGE_CHANNEL}, ${JSON.stringify(change)})`,
  );

  return change;
};
