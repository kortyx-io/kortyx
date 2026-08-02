import type { EnsureWorkflowTopologyRequest } from "@kortyx/telemetry-contracts";
import { and, eq } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { workflowRevisions } from "../schema";
import { ensureProjectEnvironmentAllowed } from "./projects";

export type EnsureWorkflowRevisionResult = {
  workflowRevisionId: string;
  created: boolean;
};

const selectWorkflowRevisionIdentity = {
  id: workflowRevisions.id,
};

export const findWorkflowRevisionByTopology = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    environment: string;
    workflowId: string;
    topologyHash: string;
  },
): Promise<string | undefined> => {
  const [revision] = await db
    .select(selectWorkflowRevisionIdentity)
    .from(workflowRevisions)
    .where(
      and(
        eq(workflowRevisions.organizationId, input.organizationId),
        eq(workflowRevisions.projectId, input.projectId),
        eq(workflowRevisions.environment, input.environment),
        eq(workflowRevisions.workflowId, input.workflowId),
        eq(workflowRevisions.topologyHash, input.topologyHash),
      ),
    )
    .limit(1);

  return revision?.id;
};

export const findWorkflowRevisionForProject = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    workflowRevisionId: string;
    environment: string;
    workflowId: string;
  },
): Promise<string | undefined> => {
  const [revision] = await db
    .select(selectWorkflowRevisionIdentity)
    .from(workflowRevisions)
    .where(
      and(
        eq(workflowRevisions.organizationId, input.organizationId),
        eq(workflowRevisions.projectId, input.projectId),
        eq(workflowRevisions.id, input.workflowRevisionId),
        eq(workflowRevisions.environment, input.environment),
        eq(workflowRevisions.workflowId, input.workflowId),
      ),
    )
    .limit(1);

  return revision?.id;
};

export const ensureWorkflowRevision = async (
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    request: EnsureWorkflowTopologyRequest;
  },
): Promise<EnsureWorkflowRevisionResult> => {
  await ensureProjectEnvironmentAllowed(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environment: input.request.environment,
  });

  const existingId = await findWorkflowRevisionByTopology(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environment: input.request.environment,
    workflowId: input.request.workflow.id,
    topologyHash: input.request.workflow.topologyHash,
  });
  if (existingId) {
    return { workflowRevisionId: existingId, created: false };
  }

  const [created] = await db
    .insert(workflowRevisions)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environment: input.request.environment,
      workflowId: input.request.workflow.id,
      declaredVersion: input.request.workflow.declaredVersion,
      topologyHash: input.request.workflow.topologyHash,
      serviceName: input.request.service.name,
      nodes: input.request.workflow.nodes,
      edges: input.request.workflow.edges,
      workflowTransitions: input.request.workflow.transitions ?? [],
      ...(input.request.service.deploymentRef
        ? { deploymentRef: input.request.service.deploymentRef }
        : {}),
      ...(input.request.workflow.description
        ? { description: input.request.workflow.description }
        : {}),
      ...(input.request.workflow.tags
        ? { tags: input.request.workflow.tags }
        : {}),
    })
    .onConflictDoNothing()
    .returning({ id: workflowRevisions.id });

  if (created) {
    return { workflowRevisionId: created.id, created: true };
  }

  const revisionId = await findWorkflowRevisionByTopology(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environment: input.request.environment,
    workflowId: input.request.workflow.id,
    topologyHash: input.request.workflow.topologyHash,
  });

  if (!revisionId) {
    throw new Error("Failed to ensure workflow revision.");
  }

  return { workflowRevisionId: revisionId, created: false };
};
