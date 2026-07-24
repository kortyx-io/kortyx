import type { KortyxTelemetryEvent } from "@kortyx/telemetry-contracts";
import type { TelemetryDb } from "../client";
import { TelemetryForbiddenError } from "../errors";
import { telemetryEvents } from "../schema";
import { ensureProjectEnvironmentAllowed } from "./projects";
import {
  findWorkflowRevisionByTopology,
  findWorkflowRevisionForProject,
} from "./workflow-revisions";

export type IngestTelemetryEventsResult = {
  accepted: number;
  inserted: number;
  duplicates: number;
};

const unique = <T>(items: T[]): T[] => [...new Set(items)];

const resolveWorkflowRevisionId = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    event: KortyxTelemetryEvent;
  },
): Promise<string | undefined> => {
  if (input.event.correlation.workflowRevisionId) {
    const revisionId = await findWorkflowRevisionForProject(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      workflowRevisionId: input.event.correlation.workflowRevisionId,
      environment: input.event.environment,
      workflowId: input.event.correlation.workflowId,
    });
    if (!revisionId) {
      throw new TelemetryForbiddenError(
        "Workflow revision is not available for this project.",
      );
    }
    return revisionId;
  }
  if (!input.event.correlation.topologyHash) return undefined;

  return findWorkflowRevisionByTopology(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environment: input.event.environment,
    workflowId: input.event.correlation.workflowId,
    topologyHash: input.event.correlation.topologyHash,
  });
};

export const ingestTelemetryEvents = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    events: KortyxTelemetryEvent[];
  },
): Promise<IngestTelemetryEventsResult> => {
  for (const environment of unique(
    input.events.map((event) => event.environment),
  )) {
    await ensureProjectEnvironmentAllowed(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environment,
    });
  }

  const values = await Promise.all(
    input.events.map(async (event) => ({
      organizationId: input.organizationId,
      projectId: input.projectId,
      eventId: event.eventId,
      schemaVersion: event.schemaVersion,
      type: event.type,
      occurredAt: new Date(event.occurredAt),
      environment: event.environment,
      serviceName: event.service.name,
      runId: event.correlation.runId,
      workflowId: event.correlation.workflowId,
      payload: event.payload,
      ...(event.service.deploymentRef
        ? { deploymentRef: event.service.deploymentRef }
        : {}),
      ...(event.correlation.traceId
        ? { traceId: event.correlation.traceId }
        : {}),
      ...(event.correlation.spanId ? { spanId: event.correlation.spanId } : {}),
      ...(event.correlation.parentSpanId
        ? { parentSpanId: event.correlation.parentSpanId }
        : {}),
      ...(event.correlation.sessionId
        ? { sessionId: event.correlation.sessionId }
        : {}),
      ...(await resolveWorkflowRevisionId(db, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        event,
      }).then((workflowRevisionId) =>
        workflowRevisionId ? { workflowRevisionId } : {},
      )),
      ...(event.correlation.topologyHash
        ? { topologyHash: event.correlation.topologyHash }
        : {}),
      ...(event.correlation.nodeId ? { nodeId: event.correlation.nodeId } : {}),
      ...(event.context?.userId ? { userId: event.context.userId } : {}),
      ...(event.context?.tenantId ? { tenantId: event.context.tenantId } : {}),
      ...(event.context?.tags ? { contextTags: event.context.tags } : {}),
      ...(event.context?.metadata
        ? { contextMetadata: event.context.metadata }
        : {}),
    })),
  );

  const inserted = await db
    .insert(telemetryEvents)
    .values(values)
    .onConflictDoNothing()
    .returning({ eventId: telemetryEvents.eventId });

  return {
    accepted: input.events.length,
    inserted: inserted.length,
    duplicates: input.events.length - inserted.length,
  };
};
