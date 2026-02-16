import { resolve } from "node:path";
import type { WorkflowDefinition } from "@kortyx/core";
import { createInMemoryAdapter, type MemoryAdapter } from "@kortyx/memory";
import {
  createProviderRegistry,
  type GetProviderFn,
  type ProviderConfig,
} from "@kortyx/providers";
import type { FrameworkAdapter, WorkflowRegistry } from "@kortyx/runtime";
import {
  createFileWorkflowRegistry,
  createFrameworkAdapterFromEnv,
  createInMemoryWorkflowRegistry,
} from "@kortyx/runtime";
import type { ChatMessage } from "../types/chat-message";
import { processChat as runProcessChat } from "./process-chat";

export type AgentProviderId = "google";

export interface AgentAiConfig {
  provider?: AgentProviderId | undefined;
  apiKey?: string | undefined;
}

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
  ai: AgentAiConfig;
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

const ROOT_KEYS = new Set([
  "ai",
  "workflows",
  "workflowsDir",
  "workflowRegistry",
  "fallbackWorkflowId",
  "defaultWorkflowId",
  "frameworkAdapter",
  "session",
  "memory",
]);
const AI_KEYS = new Set(["provider", "apiKey"]);
const SESSION_KEYS = new Set(["id"]);
const MEMORY_KEYS = new Set(["enabled", "namespace", "ttlMs"]);
const PROCESS_OPTIONS_KEYS = new Set(["sessionId", "workflowId", "workflow"]);

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const assertNoUnknownKeys = (
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
): void => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown key \`${path}.${key}\` in createAgent config.`);
    }
  }
};

const assertOptionalString = (value: unknown, path: string): void => {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`Expected \`${path}\` to be a string.`);
  }
};

const assertOptionalBoolean = (value: unknown, path: string): void => {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`Expected \`${path}\` to be a boolean.`);
  }
};

const assertOptionalFiniteNumber = (value: unknown, path: string): void => {
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(`Expected \`${path}\` to be a finite number.`);
  }
};

function assertAgentProcessOptions(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    throw new Error("Expected processChat options to be an object.");
  }

  assertNoUnknownKeys(value, PROCESS_OPTIONS_KEYS, "options");
  assertOptionalString(value.sessionId, "options.sessionId");
  assertOptionalString(value.workflowId, "options.workflowId");
  assertOptionalString(value.workflow, "options.workflow");
}

function assertCreateAgentArgs(
  value: unknown,
): asserts value is CreateAgentArgs {
  if (!isRecord(value)) {
    throw new Error("createAgent expects an object.");
  }

  assertNoUnknownKeys(value, ROOT_KEYS, "args");

  const ai = value.ai;
  if (!isRecord(ai)) {
    throw new Error("createAgent requires `ai` config.");
  }
  assertNoUnknownKeys(ai, AI_KEYS, "args.ai");
  assertOptionalString(ai.provider, "args.ai.provider");
  assertOptionalString(ai.apiKey, "args.ai.apiKey");

  if (ai.provider && ai.provider !== "google") {
    throw new Error(
      `Unsupported ai.provider \`${ai.provider}\`. Supported providers: google.`,
    );
  }

  if (value.workflows !== undefined) {
    if (!Array.isArray(value.workflows)) {
      throw new Error("`workflows` must be an array.");
    }
  }

  assertOptionalString(value.workflowsDir, "args.workflowsDir");
  assertOptionalString(value.fallbackWorkflowId, "args.fallbackWorkflowId");
  assertOptionalString(value.defaultWorkflowId, "args.defaultWorkflowId");

  const workflowSources = [
    value.workflows !== undefined,
    value.workflowsDir !== undefined,
    value.workflowRegistry !== undefined,
  ].filter(Boolean).length;
  if (workflowSources > 1) {
    throw new Error(
      "Use only one workflow source: `workflows`, `workflowsDir`, or `workflowRegistry`.",
    );
  }

  if (value.session !== undefined) {
    if (!isRecord(value.session)) {
      throw new Error("`session` must be an object.");
    }
    assertNoUnknownKeys(value.session, SESSION_KEYS, "args.session");
    assertOptionalString(value.session.id, "args.session.id");
  }

  if (value.memory !== undefined) {
    if (!isRecord(value.memory)) {
      throw new Error("`memory` must be an object.");
    }
    assertNoUnknownKeys(value.memory, MEMORY_KEYS, "args.memory");
    assertOptionalBoolean(value.memory.enabled, "args.memory.enabled");
    assertOptionalString(value.memory.namespace, "args.memory.namespace");
    assertOptionalFiniteNumber(value.memory.ttlMs, "args.memory.ttlMs");
    if (typeof value.memory.ttlMs === "number" && value.memory.ttlMs <= 0) {
      throw new Error("`memory.ttlMs` must be greater than 0.");
    }
  }
}

const resolveGoogleApiKey = (apiKey?: string): string | undefined =>
  apiKey ??
  process.env.GOOGLE_API_KEY ??
  process.env.GEMINI_API_KEY ??
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
  process.env.KORTYX_GOOGLE_API_KEY ??
  process.env.KORTYX_GEMINI_API_KEY;

const importProviderPackage = async (specifier: string): Promise<unknown> => {
  try {
    return await dynamicImport(specifier);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load provider package \`${specifier}\`. Install it first (e.g. \`pnpm add ${specifier}\`). Cause: ${cause}`,
    );
  }
};

const resolveGetProvider = async (
  ai: AgentAiConfig,
): Promise<GetProviderFn> => {
  const provider = ai.provider ?? "google";

  if (provider === "google") {
    const apiKey = resolveGoogleApiKey(ai.apiKey);
    if (!apiKey) {
      throw new Error(
        "Missing Google API key. Set `ai.apiKey` or one of GOOGLE_API_KEY / GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / KORTYX_GOOGLE_API_KEY / KORTYX_GEMINI_API_KEY.",
      );
    }

    const providerModule = await importProviderPackage("@kortyx/google");
    if (!isRecord(providerModule)) {
      throw new Error("Invalid provider module shape for @kortyx/google.");
    }

    const createGoogleProvider = providerModule.createGoogleProvider;
    if (typeof createGoogleProvider !== "function") {
      throw new Error(
        "Provider package @kortyx/google does not export createGoogleProvider(apiKey).",
      );
    }

    const registry = createProviderRegistry();
    registry.register(
      (createGoogleProvider as (key: string) => ProviderConfig)(apiKey),
    );
    return registry.getProvider;
  }

  throw new Error(`Unsupported ai.provider \`${provider}\`.`);
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
  assertCreateAgentArgs(args);

  const {
    ai,
    workflows,
    workflowsDir,
    workflowRegistry,
    fallbackWorkflowId,
    defaultWorkflowId,
    frameworkAdapter,
    session,
    memory,
  } = args;

  const resolvedDefaultWorkflowId = defaultWorkflowId ?? fallbackWorkflowId;
  const resolvedFrameworkAdapter: FrameworkAdapter =
    frameworkAdapter ?? createFrameworkAdapterFromEnv();
  const defaultSessionId = session?.id ?? "anonymous-session";
  const memoryAdapter = resolveMemoryAdapter(memory);

  const getProviderPromise = resolveGetProvider(ai);
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
      assertAgentProcessOptions(options);

      const [registry, getProvider] = await Promise.all([
        registryPromise,
        getProviderPromise,
      ]);
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
        options,
        workflowRegistry: registry,
        frameworkAdapter: resolvedFrameworkAdapter,
        getProvider,
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
