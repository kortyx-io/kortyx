import { resolve } from "node:path";
import type { WorkflowDefinition } from "@kortyx/core";
import { createInMemoryAdapter, type MemoryAdapter } from "@kortyx/memory";
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
import { z } from "zod";
import type { ChatMessage } from "../types/chat-message";
import { processChat as runProcessChat } from "./process-chat";

export interface AgentSessionConfig {
  id?: string | undefined;
}

export interface AgentMemoryConfig {
  enabled?: boolean | undefined;
  namespace?: string | undefined;
  ttlMs?: number | undefined;
}

export interface AgentProcessOptions {
  sessionId?: string | undefined;
  workflowId?: string | undefined;
  workflow?: string | undefined;
}

export interface CreateAgentArgs {
  getProvider?: GetProviderFn | undefined;
  workflows?: WorkflowDefinition[];
  workflowsDir?: string;
  workflowRegistry?: WorkflowRegistry;
  fallbackWorkflowId?: string;
  defaultWorkflowId?: string;
  frameworkAdapter?: FrameworkAdapter;
  session?: AgentSessionConfig;
  memory?: AgentMemoryConfig;
}

export interface Agent {
  processChat: (
    messages: ChatMessage[],
    options?: AgentProcessOptions,
  ) => Promise<Response>;
}

const agentProcessOptionsSchema = z
  .object({
    sessionId: z.string().optional(),
    workflowId: z.string().optional(),
    workflow: z.string().optional(),
  })
  .strict();

const createAgentArgsBaseSchema = z
  .object({
    getProvider: z.unknown().optional(),
    workflows: z.array(z.unknown()).optional(),
    workflowsDir: z.string().optional(),
    workflowRegistry: z.unknown().optional(),
    fallbackWorkflowId: z.string().optional(),
    defaultWorkflowId: z.string().optional(),
    frameworkAdapter: z.unknown().optional(),
    session: z
      .object({
        id: z.string().optional(),
      })
      .strict()
      .optional(),
    memory: z
      .object({
        enabled: z.boolean().optional(),
        namespace: z.string().optional(),
        ttlMs: z.number().finite().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const createAgentArgsSchema = createAgentArgsBaseSchema.superRefine(
  (value: z.infer<typeof createAgentArgsBaseSchema>, ctx: z.RefinementCtx) => {
    if (
      value.getProvider !== undefined &&
      typeof value.getProvider !== "function"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
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
        code: z.ZodIssueCode.custom,
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

const resolveMemoryAdapter = (
  memory: AgentMemoryConfig | undefined,
): MemoryAdapter | undefined => {
  if (memory?.enabled === false) return undefined;

  return createInMemoryAdapter({
    namespace: memory?.namespace ?? "kortyx-agent",
    ttlMs: memory?.ttlMs ?? 1000 * 60 * 60,
  });
};

export function createAgent(args: CreateAgentArgs): Agent {
  const parsedArgs = parseCreateAgentArgs(args);

  const {
    getProvider,
    workflows,
    workflowsDir,
    workflowRegistry,
    fallbackWorkflowId,
    defaultWorkflowId,
    frameworkAdapter,
    session,
    memory,
  } = parsedArgs;

  const resolvedDefaultWorkflowId = defaultWorkflowId ?? fallbackWorkflowId;
  const resolvedFrameworkAdapter: FrameworkAdapter =
    frameworkAdapter ?? createFrameworkAdapterFromEnv();
  const defaultSessionId = session?.id ?? "anonymous-session";
  const memoryAdapter = resolveMemoryAdapter(memory);
  const resolvedGetProvider = getProvider ?? getRegisteredProvider;

  const resolvedCwd = process.cwd();

  const registryPromise: Promise<WorkflowRegistry | undefined> = (async () => {
    if (workflowRegistry) return workflowRegistry;
    if (workflows) {
      return createInMemoryWorkflowRegistry(workflows, {
        fallbackId: fallbackWorkflowId ?? "general-chat",
      });
    }
    if (workflowsDir) {
      return createFileWorkflowRegistry({
        workflowsDir,
        fallbackId: fallbackWorkflowId ?? "general-chat",
      });
    }

    const resolvedWorkflowsDir = resolve(resolvedCwd, "src", "workflows");
    return createFileWorkflowRegistry({
      workflowsDir: resolvedWorkflowsDir,
      fallbackId: fallbackWorkflowId ?? "general-chat",
    });
  })();

  return {
    processChat: async (
      messages: ChatMessage[],
      options?: AgentProcessOptions,
    ): Promise<Response> => {
      const parsedOptions = parseAgentProcessOptions(options);

      const registry = await registryPromise;
      if (!registry) {
        throw new Error(
          "createAgent requires workflows, workflowsDir, or workflowRegistry.",
        );
      }

      return runProcessChat({
        ...(resolvedDefaultWorkflowId
          ? { defaultWorkflowId: resolvedDefaultWorkflowId }
          : {}),
        messages,
        options: parsedOptions,
        workflowRegistry: registry,
        frameworkAdapter: resolvedFrameworkAdapter,
        getProvider: resolvedGetProvider,
        ...(memoryAdapter ? { memoryAdapter } : {}),
        loadRuntimeConfig: (runtimeOptions?: AgentProcessOptions) => ({
          session: {
            id: runtimeOptions?.sessionId ?? defaultSessionId,
          },
        }),
      });
    },
  };
}
