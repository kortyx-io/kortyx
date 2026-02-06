import type {
  InterruptInput,
  InterruptResult,
  ModelConfig,
  NodeContext,
} from "@kortyx/core";
import type { MemoryAdapter } from "@kortyx/memory";
import { getHookContext } from "./context";

type StateSetter<T> = (next: T | ((prev: T) => T)) => void;

type ResolvedModel = {
  provider: string;
  name: string;
  temperature: number | undefined;
};

const DEFAULT_PROVIDER = "google";
const DEFAULT_MODEL = "gemini-2.5-flash";

const resolveModel = (
  modelId: string | undefined,
  config?: ModelConfig,
): ResolvedModel => {
  const defaultProvider = config?.provider ?? DEFAULT_PROVIDER;
  const defaultModel = config?.name ?? DEFAULT_MODEL;

  if (!modelId) {
    return {
      provider: defaultProvider,
      name: defaultModel,
      temperature: config?.temperature,
    };
  }

  const separatorIndex = modelId.indexOf(":");
  if (separatorIndex === -1) {
    return {
      provider: defaultProvider,
      name: modelId,
      temperature: config?.temperature,
    };
  }

  const provider = modelId.slice(0, separatorIndex) || defaultProvider;
  const name = modelId.slice(separatorIndex + 1) || defaultModel;

  return {
    provider,
    name,
    temperature: config?.temperature,
  };
};

export type AiCallArgs = {
  prompt: string;
  system?: string | undefined;
  temperature?: number | undefined;
  emit?: boolean | undefined;
  stream?: boolean | undefined;
};

export type AiCallResult = {
  text: string;
};

export type AiModel = {
  call: (args: AiCallArgs) => Promise<AiCallResult>;
};

export function useEmit(): NodeContext["emit"] {
  const ctx = getHookContext();
  return ctx.node.emit;
}

export function useStructuredData(args: {
  data: unknown;
  dataType?: string | undefined;
}): void {
  const ctx = getHookContext();
  ctx.node.emit("structured_data", {
    node: ctx.node.graph.node,
    ...(typeof args.dataType === "string" && args.dataType.length > 0
      ? { dataType: args.dataType }
      : {}),
    data: args.data,
  });
}

export function useAiProvider(modelId?: string): AiModel {
  const ctx = getHookContext();
  const getProvider = ctx.getProvider;
  if (!getProvider) {
    throw new Error(
      "useAiProvider requires a provider factory in runtime config.",
    );
  }

  const { provider, name, temperature } = resolveModel(
    modelId,
    ctx.node.config?.model,
  );

  return {
    call: async ({ prompt, system, temperature: overrideTemperature }) => {
      if (!ctx.node.speak) {
        throw new Error("useAiProvider requires ctx.speak in NodeContext.");
      }
      const text = await ctx.node.speak({
        ...(typeof system === "string" && system.length > 0 ? { system } : {}),
        user: prompt,
        model: {
          provider,
          name,
          ...(overrideTemperature !== undefined
            ? { temperature: overrideTemperature }
            : temperature !== undefined
              ? { temperature }
              : {}),
        },
        stream: { minChars: 12, flushMs: 50, segmentChars: 48 },
      });
      return { text };
    },
  };
}

export function useAiMemory(): MemoryAdapter {
  const ctx = getHookContext();
  if (!ctx.memoryAdapter) {
    throw new Error("useAiMemory requires a memory adapter in runtime config.");
  }
  return ctx.memoryAdapter;
}

export function useAiInterrupt(
  input: InterruptInput,
): Promise<InterruptResult> {
  const ctx = getHookContext();
  return Promise.resolve(ctx.node.awaitInterrupt(input));
}

export function useNodeState<T>(initialValue: T): [T, StateSetter<T>];
export function useNodeState<T>(
  key: string,
  initialValue?: T,
): [T, StateSetter<T>];
export function useNodeState<T>(
  keyOrInitial: string | T,
  initialValue?: T,
): [T, StateSetter<T>] {
  const ctx = getHookContext();
  const nodeState = ctx.currentNodeState;

  if (typeof keyOrInitial === "string") {
    const key = keyOrInitial;
    const hasInitial = arguments.length > 1;

    if (!Object.hasOwn(nodeState.byKey, key) && hasInitial) {
      nodeState.byKey[key] = initialValue as T;
      ctx.dirty = true;
    }

    const getValue = () => nodeState.byKey[key] as T;
    const setValue: StateSetter<T> = (next) => {
      const prev = getValue();
      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      nodeState.byKey[key] = resolved;
      ctx.dirty = true;
    };

    return [getValue(), setValue];
  }

  const index = ctx.nodeStateIndex++;
  if (index >= nodeState.byIndex.length) {
    nodeState.byIndex[index] = keyOrInitial as T;
    ctx.dirty = true;
  }

  const getValue = () => nodeState.byIndex[index] as T;
  const setValue: StateSetter<T> = (next) => {
    const prev = getValue();
    const resolved =
      typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    nodeState.byIndex[index] = resolved;
    ctx.dirty = true;
  };

  return [getValue(), setValue];
}

export function useWorkflowState<T>(
  key: string,
  initialValue?: T,
): [T, StateSetter<T>] {
  const ctx = getHookContext();
  const workflowState = ctx.workflowState;
  const hasInitial = arguments.length > 1;

  if (!Object.hasOwn(workflowState, key) && hasInitial) {
    workflowState[key] = initialValue as T;
    ctx.dirty = true;
  }

  const getValue = () => workflowState[key] as T;
  const setValue: StateSetter<T> = (next) => {
    const prev = getValue();
    const resolved =
      typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    workflowState[key] = resolved;
    ctx.dirty = true;
  };

  return [getValue(), setValue];
}
