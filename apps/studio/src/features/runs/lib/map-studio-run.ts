import type { StudioRun } from "@kortyx/telemetry-contracts";
import { formatRelativeTime } from "@/lib/format";
import { type Run, RunSchema } from "../schema";

const optional = <T>(value: T | null): T | undefined =>
  value === null ? undefined : value;
const durationSeconds = (value: number | null) =>
  value === null ? undefined : value / 1000;
const displayVersion = (value: string | null) => value ?? "unversioned";
const displayText = (value: string | null, fallback = "—") => value ?? fallback;
export const mapStudioRun = (run: StudioRun): Run =>
  RunSchema.parse({
    id: run.id,
    feedback: run.feedback,
    parentRunId: run.parentRunId,
    parentWorkflowId: run.parentWorkflowId,
    invocationId: run.invocationId,
    branchId: run.branchId,
    callId: run.callId,
    status: run.status,
    started: formatRelativeTime(run.startedAt),
    startedAt: run.startedAt,
    workflow: run.workflowId,
    workflowIds: run.workflowIds,
    workflowRefs: run.workflowRefs.map((ref) => ({
      workflowId: ref.workflowId,
      workflowRevisionId: optional(ref.workflowRevisionId),
      declaredVersion: optional(ref.declaredVersion),
    })),
    version: displayVersion(run.declaredVersion),
    transitionIds: run.transitionIds,
    path: run.path.length ? run.path : [run.workflowId],
    session: displayText(run.sessionId),
    model: displayText(run.model, "unknown"),
    ...(run.models.length > 1 ? { models: run.models.length - 1 } : {}),
    duration: durationSeconds(run.durationMs) ?? 0,
    ...(run.tokens !== null ? { tokens: run.tokens } : {}),
    ...(run.cost !== null ? { cost: run.cost } : {}),
    result: displayText(run.result, run.pricingStatus),
    provider: displayText(run.provider, "unknown"),
    environment: run.environment,
    user: displayText(run.userId),
    tenant: displayText(run.tenantId),
    hasTool: run.hasTool,
    ...(run.hasRetry ? { hasRetry: true } : {}),
    ...(run.interruptNodeId ? { interruptNode: run.interruptNodeId } : {}),
    ...(run.interruptId ? { interruptId: run.interruptId } : {}),
    ...(run.interruptStatus ? { interruptStatus: run.interruptStatus } : {}),
    ...(run.interruptExpiresAt
      ? { interruptExpiresAt: run.interruptExpiresAt }
      : {}),
  });
