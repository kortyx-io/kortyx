import "server-only";

import {
  StudioCatalogsResponseSchema,
  StudioInterruptDetailResponseSchema,
  StudioInterruptsResponseSchema,
  type StudioInterruptType,
  StudioRunDetailResponseSchema,
  StudioRunsResponseSchema,
  StudioSessionDetailResponseSchema,
  StudioSessionsResponseSchema,
  StudioWorkflowsResponseSchema,
} from "@kortyx/telemetry-contracts";
import { type Interrupt, InterruptSchema } from "@/features/interrupts/schema";
import { type Run, RunSchema } from "@/features/runs/schema";
import { type Session, SessionSchema } from "@/features/sessions/schema";
import {
  type WorkflowSystem,
  WorkflowSystemSchema,
} from "@/features/workflows/schema";
import { formatRelativeTime } from "@/lib/format";

const apiUrl = process.env.KORTYX_API_URL;
const apiKey = process.env.KORTYX_STUDIO_API_KEY;

export type StudioApiError = {
  type: "not_configured" | "http" | "parse" | "network";
  message: string;
  status?: number | undefined;
};

export type StudioRepoResult<T> =
  | { data: T; error: null }
  | { data: null; error: StudioApiError };

export type StudioPage<T> = {
  items: T[];
  totalCount: number;
};

const endpoint = (path: string): string =>
  `${apiUrl?.replace(/\/$/, "")}${path}`;

const withQuery = (
  path: string,
  query?: Record<string, string | string[] | undefined>,
): string => {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
};

const fetchJson = async <T>(
  path: string,
  parse: (value: unknown) => T,
): Promise<StudioRepoResult<T>> => {
  if (!apiUrl || !apiKey) {
    return {
      data: null,
      error: {
        type: "not_configured",
        message: "KORTYX_API_URL and KORTYX_STUDIO_API_KEY are required.",
      },
    };
  }

  try {
    const response = await fetch(endpoint(path), {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      let message = `Kortyx Studio API request failed: ${response.status}`;
      try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === "string" && body.message) {
          message = body.message;
        }
      } catch {
        // Preserve the status fallback when an upstream error is not JSON.
      }
      return {
        data: null,
        error: {
          type: "http",
          status: response.status,
          message,
        },
      };
    }

    try {
      return { data: parse(await response.json()), error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          type: "parse",
          message:
            error instanceof Error
              ? error.message
              : "Kortyx Studio API response could not be parsed.",
        },
      };
    }
  } catch (error) {
    return {
      data: null,
      error: {
        type: "network",
        message:
          error instanceof Error
            ? error.message
            : "Kortyx Studio API request failed.",
      },
    };
  }
};

const parseError = (error: unknown): StudioApiError => ({
  type: "parse",
  message:
    error instanceof Error
      ? error.message
      : "Kortyx Studio API response could not be parsed.",
});

const optional = <T>(value: T | null): T | undefined =>
  value === null ? undefined : value;

const durationSeconds = (durationMs: number | null): number | undefined =>
  durationMs === null ? undefined : durationMs / 1000;

const displayVersion = (value: string | null): string => value ?? "unversioned";

const displayText = (value: string | null, fallback = "—"): string =>
  value ?? fallback;

const normalizeInterruptType = (
  value: StudioInterruptType,
): Interrupt["type"] => value;

export const getStudioRuns = async (
  query?: Record<string, string | string[] | undefined>,
): Promise<StudioRepoResult<StudioPage<Run>>> => {
  const response = await fetchJson(
    withQuery("/v1/studio/runs", query),
    (value) => StudioRunsResponseSchema.parse(value),
  );
  if (response.error) return response;
  try {
    return {
      data: {
        items: RunSchema.array().parse(
          response.data.runs.map((run) => ({
            id: run.id,
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
            ...(run.interruptNodeId
              ? { interruptNode: run.interruptNodeId }
              : {}),
          })),
        ),
        totalCount: response.data.totalCount,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: parseError(error) };
  }
};

export const getStudioRunDetail = (runId: string) =>
  fetchJson(`/v1/studio/runs/${encodeURIComponent(runId)}`, (value) =>
    StudioRunDetailResponseSchema.parse(value),
  );

export const getStudioSessionDetail = (sessionId: string) =>
  fetchJson(`/v1/studio/sessions/${encodeURIComponent(sessionId)}`, (value) =>
    StudioSessionDetailResponseSchema.parse(value),
  );

export const getStudioInterruptDetail = (interruptId: string) =>
  fetchJson(
    `/v1/studio/interrupts/${encodeURIComponent(interruptId)}`,
    (value) => StudioInterruptDetailResponseSchema.parse(value),
  );

export const getStudioSessions = async (
  query?: Record<string, string | string[] | undefined>,
): Promise<StudioRepoResult<StudioPage<Session>>> => {
  const response = await fetchJson(
    withQuery("/v1/studio/sessions", query),
    (value) => StudioSessionsResponseSchema.parse(value),
  );
  if (response.error) return response;
  try {
    return {
      data: {
        items: SessionSchema.array().parse(
          response.data.sessions.map((session) => ({
            id: session.id,
            status: session.status,
            lastActivityAt: session.lastActivityAt,
            workflow: displayText(session.activeWorkflowId, "unknown"),
            workflowIds: session.workflowIds,
            workflowCount: session.workflowCount,
            version: displayVersion(session.activeVersion),
            user: optional(session.userId),
            tenant: optional(session.tenantId),
            runs: session.runs,
            succeeded: session.succeeded,
            failed: session.failed,
            interrupted: session.interrupted,
            checkpoints: session.checkpoints,
            hasFork: session.hasFork,
            duration: durationSeconds(session.durationMs),
            tokens: optional(session.tokens),
            cost: optional(session.cost),
            latestResult: displayText(
              session.latestResult,
              session.pricingStatus,
            ),
            latestError: optional(session.latestError),
            pendingInterrupt: optional(session.pendingInterruptId),
            providers: session.providers,
            models: session.models,
            tags: session.tags,
            environment: session.environment,
          })),
        ),
        totalCount: response.data.totalCount,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: parseError(error) };
  }
};

export const getStudioInterrupts = async (
  query?: Record<string, string | string[] | undefined>,
): Promise<StudioRepoResult<StudioPage<Interrupt>>> => {
  const response = await fetchJson(
    withQuery("/v1/studio/interrupts", query),
    (value) => StudioInterruptsResponseSchema.parse(value),
  );
  if (response.error) return response;
  try {
    return {
      data: {
        items: InterruptSchema.array().parse(
          response.data.interrupts.map((interrupt) => ({
            id: interrupt.id,
            status: interrupt.status,
            type: normalizeInterruptType(interrupt.type),
            createdAt: interrupt.createdAt,
            resolvedAt: optional(interrupt.resolvedAt),
            question: displayText(interrupt.question, "Content not captured"),
            optionCount: optional(interrupt.optionCount),
            workflow: interrupt.workflowId,
            node: displayText(interrupt.nodeId),
            session: displayText(interrupt.sessionId),
            user: optional(interrupt.userId),
            tenant: optional(interrupt.tenantId),
            response: optional(interrupt.response),
            resumeOutcome: optional(interrupt.resumeOutcome),
            resumeError: optional(interrupt.resumeError),
            runId: interrupt.runId,
            resumeToken: displayText(interrupt.resumeToken),
            resolvedBy: optional(interrupt.resolvedBy),
            environment: interrupt.environment,
          })),
        ),
        totalCount: response.data.totalCount,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: parseError(error) };
  }
};

export const getStudioWorkflows = async (
  query?: Record<string, string | string[] | undefined>,
): Promise<StudioRepoResult<WorkflowSystem>> => {
  const response = await fetchJson(
    withQuery("/v1/studio/workflows", query),
    (value) => StudioWorkflowsResponseSchema.parse(value),
  );
  if (response.error) return response;
  try {
    return {
      data: WorkflowSystemSchema.parse({
        cohort: {
          ...response.data.cohort,
          workflowId: optional(response.data.cohort.workflowId),
          version: optional(response.data.cohort.version),
        },
        workflows: response.data.workflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          description: optional(workflow.description),
          versions: workflow.versions,
          activeVersion: displayVersion(workflow.activeVersion),
          health: workflow.health,
          tags: workflow.tags,
          lastActivityAt: optional(workflow.lastActivityAt),
          metrics: {
            runCount: workflow.metrics.runCount,
            successRate: optional(workflow.metrics.successRate),
            errorRate: optional(workflow.metrics.errorRate),
            retryCount: optional(workflow.metrics.retryCount),
            interruptRate: optional(workflow.metrics.interruptRate),
            p50DurationMs: optional(workflow.metrics.p50DurationMs),
            p95DurationMs: optional(workflow.metrics.p95DurationMs),
            averageTokens: optional(workflow.metrics.averageTokens),
            averageCost: optional(workflow.metrics.averageCost),
          },
          nodes: workflow.nodes.map((node) => ({
            id: node.id,
            label: node.label,
            type: optional(node.type),
            state: optional(node.state),
            provider: optional(node.provider),
            model: optional(node.model),
            metrics: {
              runCount: node.metrics.runCount,
              successRate: optional(node.metrics.successRate),
              errorRate: optional(node.metrics.errorRate),
              retryCount: optional(node.metrics.retryCount),
              interruptRate: optional(node.metrics.interruptRate),
              p50DurationMs: optional(node.metrics.p50DurationMs),
              p95DurationMs: optional(node.metrics.p95DurationMs),
              averageTokens: optional(node.metrics.averageTokens),
              averageCost: optional(node.metrics.averageCost),
            },
          })),
          internalEdges: workflow.internalEdges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            condition: optional(edge.condition),
          })),
        })),
        transitions: response.data.transitions.map((transition) => ({
          id: transition.id,
          sourceWorkflowId: transition.sourceWorkflowId,
          sourceNodeId: optional(transition.sourceNodeId),
          targetWorkflowId: transition.targetWorkflowId,
          condition: optional(transition.condition),
          volume: transition.volume,
          successRate: optional(transition.successRate),
          medianDurationMs: optional(transition.medianDurationMs),
          errorRate: optional(transition.errorRate),
        })),
      }),
      error: null,
    };
  } catch (error) {
    return { data: null, error: parseError(error) };
  }
};

export const getStudioCatalogs = async () =>
  fetchJson("/v1/studio/catalogs", (value) =>
    StudioCatalogsResponseSchema.parse(value),
  );
