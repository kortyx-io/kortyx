import { resolve } from "node:path";
import type { WorkflowDefinition } from "@kortyx/core";
import {
  type GetProviderFn,
  getProvider as getRegisteredProvider,
} from "@kortyx/providers";
import type { FrameworkAdapter, WorkflowRegistry } from "@kortyx/runtime";
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
}

export interface CreateAgentArgs {
  getProvider?: GetProviderFn | undefined;
  workflows?: WorkflowDefinition[];
  workflowsDir?: string;
  workflowRegistry?: WorkflowRegistry;
  defaultWorkflowId?: string;
  frameworkAdapter?: FrameworkAdapter;
}

export interface Agent {
  streamChat: (
    messages: ChatMessage[],
    options?: AgentProcessOptions,
  ) => Promise<AsyncIterable<StreamChunk>>;
}

const agentProcessOptionsSchema = z
  .object({
    sessionId: z.string().optional(),
    workflowId: z.string().optional(),
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
  const firstIssue = parsed.error.issues[0];
  throw new Error(firstIssue?.message ?? "Invalid configuration.");
};

const parseCreateAgentArgs = (value: unknown): CreateAgentArgs =>
  parseSchema(createAgentArgsSchema, value) as CreateAgentArgs;

const parseAgentProcessOptions = (
  value: unknown,
): AgentProcessOptions | undefined => {
  if (value === undefined) return undefined;
  return parseSchema(agentProcessOptionsSchema, value);
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
      loadRuntimeConfig: (runtimeOptions?: AgentProcessOptions) =>
        runtimeOptions?.sessionId
          ? {
              session: {
                id: runtimeOptions.sessionId,
              },
            }
          : {},
    });
  };

  return { streamChat };
}
