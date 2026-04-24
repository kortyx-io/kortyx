import type {
  GraphState,
  InterruptInput,
  InterruptResult,
  NodeContext,
} from "@kortyx/core";
import type {
  GetProviderFn,
  KortyxInvokeResult,
  KortyxModel,
  KortyxStreamChunk,
  ProviderSelector,
} from "@kortyx/providers";
import { vi } from "vitest";

export type EmitRecord = { event: string; payload: unknown };

type InvokeResponse = string | KortyxInvokeResult;

type CreateProviderArgs = {
  invokeResponses?: InvokeResponse[];
  streamResponses?: Array<KortyxStreamChunk | string>;
};

type CreateNodeArgs = {
  nodeId?: string;
  interruptResponse?: InterruptResult;
  onInterrupt?: (input: InterruptInput) => InterruptResult;
};

export const createState = (
  runtime: Record<string, unknown> = {},
): GraphState =>
  ({
    input: "",
    lastNode: "__start__",
    currentWorkflow: "test-workflow",
    config: {},
    runtime,
    awaitingHumanInput: false,
    conversationHistory: [],
  }) as GraphState;

export const createProvider = (args: CreateProviderArgs = {}) => {
  const invokeQueue = [...(args.invokeResponses ?? [])];
  const streamQueue = [...(args.streamResponses ?? [])];

  const invoke = vi.fn(async () => {
    const next = invokeQueue.shift();
    if (next === undefined) {
      throw new Error("No mock invoke response configured");
    }
    if (typeof next === "string") return { content: next };
    return next;
  });

  const stream = vi.fn(async function* () {
    for (const chunk of streamQueue) {
      yield chunk;
    }
  });

  const provider = Object.assign(
    ((modelId: "mock-model", options) => ({
      provider,
      modelId,
      ...(options ? { options } : {}),
    })) as unknown as ProviderSelector<"mock", "mock-model">,
    {
      id: "mock" as const,
      models: ["mock-model"] as const,
      getModel: vi.fn((modelId: "mock-model", options) => {
        if (modelId !== "mock-model") {
          throw new Error(`Unknown mock model: ${modelId}`);
        }

        return {
          invoke,
          stream,
          temperature: options?.temperature ?? 0,
          streaming: options?.streaming ?? true,
        } satisfies KortyxModel;
      }),
    },
  );

  const modelRef = provider("mock-model");
  const getProvider = vi.fn((providerId: string) => {
    if (providerId !== provider.id) {
      throw new Error(`Unknown mock provider: ${providerId}`);
    }
    return provider;
  }) as unknown as GetProviderFn;

  return { getProvider, invoke, modelRef, provider, stream };
};

export const createNode = (args: CreateNodeArgs = {}) => {
  const emitted: EmitRecord[] = [];
  const interrupts: InterruptInput[] = [];
  const nodeId =
    typeof args.nodeId === "string" && args.nodeId.length > 0
      ? args.nodeId
      : "reason";

  const node: NodeContext = {
    graph: { name: "test-workflow", node: nodeId },
    config: {},
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
    error: () => {},
    awaitInterrupt: (input) => {
      interrupts.push(input);
      if (args.onInterrupt) return args.onInterrupt(input);
      return args.interruptResponse ?? "";
    },
    speak: async () => "",
  };

  return { node, emitted, interrupts };
};
