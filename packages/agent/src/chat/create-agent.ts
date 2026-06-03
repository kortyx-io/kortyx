import { resolve } from "node:path";
import type { WorkflowDefinition } from "@kortyx/core";
import {
  type GetProviderFn,
  getProvider as getRegisteredProvider,
} from "@kortyx/providers";
import type {
  CheckpointId,
  CheckpointSummary,
  ExecutionRuntimeConfig,
  ForkSessionCheckpointResult,
  FrameworkAdapter,
  PendingRequestRecord,
  RollbackSessionCheckpointResult,
  SessionCheckpointRecord,
  WorkflowRegistry,
} from "@kortyx/runtime";
import {
  createFileWorkflowRegistry,
  createFrameworkAdapterFromEnv,
  createInMemoryWorkflowRegistry,
} from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import { z } from "zod";
import type { ChatMessage } from "../types/chat-message";
import { streamChat as runStreamChat } from "./process-chat";

export interface AgentProcessOptions {
  sessionId?: string | undefined;
  workflowId?: string | undefined;
  context?: Record<string, unknown> | undefined;
}

export interface CreateAgentArgs {
  getProvider?: GetProviderFn | undefined;
  workflows?: WorkflowDefinition[];
  workflowsDir?: string;
  workflowRegistry?: WorkflowRegistry;
  defaultWorkflowId?: string;
  frameworkAdapter?: FrameworkAdapter;
  telemetry?: ExecutionRuntimeConfig["telemetry"];
}

export interface Agent {
  streamChat: (
    messages: ChatMessage[],
    options?: AgentProcessOptions,
  ) => Promise<AsyncIterable<StreamChunk>>;
  listCheckpoints: (sessionId: string) => Promise<CheckpointSummary[]>;
  getCheckpoint: (id: CheckpointId) => Promise<SessionCheckpointRecord | null>;
  rollbackTo: (id: CheckpointId) => Promise<RollbackSessionCheckpointResult>;
  fork: (
    id: CheckpointId,
    options?: { newSessionId?: string },
  ) => Promise<ForkSessionCheckpointResult>;
}

const agentProcessOptionsSchema = z
  .object({
    sessionId: z.string().optional(),
    workflowId: z.string().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const createAgentArgsBaseSchema = z
  .object({
    getProvider: z.unknown().optional(),
    workflows: z.array(z.unknown()).optional(),
    workflowsDir: z.string().optional(),
    workflowRegistry: z.unknown().optional(),
    defaultWorkflowId: z.string().optional(),
    frameworkAdapter: z.unknown().optional(),
    telemetry: z.unknown().optional(),
  })
  .strict();

const createAgentArgsSchema = createAgentArgsBaseSchema.superRefine(
  (value: z.infer<typeof createAgentArgsBaseSchema>, ctx: z.RefinementCtx) => {
    if (
      value.getProvider !== undefined &&
      typeof value.getProvider !== "function"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Expected `args.getProvider` to be a function.",
        path: ["getProvider"],
      });
    }

    const workflowSources = [
      value.workflows !== undefined,
      value.workflowsDir !== undefined,
      value.workflowRegistry !== undefined,
    ].filter(Boolean).length;

    if (workflowSources > 1) {
      ctx.addIssue({
        code: "custom",
        message:
          "Use only one workflow source: `workflows`, `workflowsDir`, or `workflowRegistry`.",
      });
    }
  },
);

const parseSchema = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const [firstIssue] = parsed.error.issues as unknown as [
    { message: string },
    ...Array<{ message: string }>,
  ];
  throw new Error(firstIssue.message);
};

const parseCreateAgentArgs = (value: unknown): CreateAgentArgs =>
  parseSchema(createAgentArgsSchema, value) as CreateAgentArgs;

const parseAgentProcessOptions = (
  value: unknown,
): AgentProcessOptions | undefined => {
  if (value === undefined) return undefined;
  return parseSchema(agentProcessOptionsSchema, value);
};

const hydratePendingGraphCheckpoint = async (
  frameworkAdapter: FrameworkAdapter,
  request: PendingRequestRecord,
): Promise<PendingRequestRecord> => {
  if (request.graphCheckpointId) return request;
  const checkpointer = frameworkAdapter.checkpointer as
    | {
        getLatestCheckpointId?: (
          threadId: string,
          checkpointNs?: string,
        ) => Promise<string | undefined>;
      }
    | undefined;
  const graphCheckpointId =
    (await checkpointer?.getLatestCheckpointId?.(
      request.runId,
      request.workflow,
    )) ?? (await checkpointer?.getLatestCheckpointId?.(request.runId, ""));
  return graphCheckpointId ? { ...request, graphCheckpointId } : request;
};

export function createAgent(args: CreateAgentArgs): Agent {
  const parsedArgs = parseCreateAgentArgs(args);

  const {
    getProvider,
    workflows,
    workflowsDir,
    workflowRegistry,
    defaultWorkflowId,
    frameworkAdapter,
    telemetry,
  } = parsedArgs;

  const resolvedDefaultWorkflowId = defaultWorkflowId;
  const resolvedFrameworkAdapter: FrameworkAdapter =
    frameworkAdapter ?? createFrameworkAdapterFromEnv();
  const resolvedGetProvider = getProvider ?? getRegisteredProvider;

  const resolvedCwd = process.cwd();

  const registryPromise: Promise<WorkflowRegistry | undefined> = (async () => {
    if (workflowRegistry) return workflowRegistry;
    if (workflows) {
      return createInMemoryWorkflowRegistry(workflows, {
        fallbackId: resolvedDefaultWorkflowId ?? "general-chat",
      });
    }
    if (workflowsDir) {
      return createFileWorkflowRegistry({
        workflowsDir,
        fallbackId: resolvedDefaultWorkflowId ?? "general-chat",
      });
    }

    const resolvedWorkflowsDir = resolve(resolvedCwd, "src", "workflows");
    return createFileWorkflowRegistry({
      workflowsDir: resolvedWorkflowsDir,
      fallbackId: resolvedDefaultWorkflowId ?? "general-chat",
    });
  })();

  const streamChat = async (
    messages: ChatMessage[],
    options?: AgentProcessOptions,
  ): Promise<AsyncIterable<StreamChunk>> => {
    const parsedOptions = parseAgentProcessOptions(options);

    const registry = await registryPromise;
    if (!registry) {
      throw new Error(
        "createAgent requires workflows, workflowsDir, or workflowRegistry.",
      );
    }

    return runStreamChat({
      ...(resolvedDefaultWorkflowId
        ? { defaultWorkflowId: resolvedDefaultWorkflowId }
        : {}),
      messages,
      options: parsedOptions,
      workflowRegistry: registry,
      frameworkAdapter: resolvedFrameworkAdapter,
      getProvider: resolvedGetProvider,
      loadRuntimeConfig: (runtimeOptions?: AgentProcessOptions) => ({
        ...(runtimeOptions?.sessionId
          ? {
              session: {
                id: runtimeOptions.sessionId,
              },
            }
          : {}),
        ...(runtimeOptions?.context ? { context: runtimeOptions.context } : {}),
        ...(telemetry ? { telemetry } : {}),
      }),
    });
  };

  const listCheckpoints = (sessionId: string) =>
    resolvedFrameworkAdapter.sessionCheckpoints.list(sessionId);

  const getCheckpoint = (id: CheckpointId) =>
    resolvedFrameworkAdapter.sessionCheckpoints.get(id);

  const rollbackTo = async (
    id: CheckpointId,
  ): Promise<RollbackSessionCheckpointResult> => {
    const result =
      await resolvedFrameworkAdapter.sessionCheckpoints.rollbackTo(id);
    const activePendingRequests = await Promise.all(
      result.activePendingRequests.map((request) =>
        hydratePendingGraphCheckpoint(resolvedFrameworkAdapter, request),
      ),
    );

    await Promise.all([
      ...result.invalidatedInterruptTokens.map((token) =>
        resolvedFrameworkAdapter.pendingRequests.delete(token),
      ),
      ...activePendingRequests.map((request) =>
        resolvedFrameworkAdapter.pendingRequests.save(request),
      ),
    ]);

    return { ...result, activePendingRequests };
  };

  const fork = async (
    id: CheckpointId,
    options?: { newSessionId?: string },
  ): Promise<ForkSessionCheckpointResult> => {
    const result = await resolvedFrameworkAdapter.sessionCheckpoints.fork(
      id,
      options,
    );
    const activePendingRequests = await Promise.all(
      result.checkpoint.activePendingRequests.map((request) =>
        hydratePendingGraphCheckpoint(resolvedFrameworkAdapter, request),
      ),
    );
    await Promise.all(
      activePendingRequests.map((request) =>
        resolvedFrameworkAdapter.pendingRequests.save(request),
      ),
    );
    return {
      ...result,
      checkpoint: { ...result.checkpoint, activePendingRequests },
    };
  };

  return { streamChat, listCheckpoints, getCheckpoint, rollbackTo, fork };
}
