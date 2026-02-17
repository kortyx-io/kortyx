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

export const createState = (memory: Record<string, unknown> = {}): GraphState =>
  ({
    input: "",
    lastNode: "__start__",
    currentWorkflow: "test-workflow",
    config: {},
    memory,
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

  const model: KortyxModel = {
    invoke,
    stream,
    temperature: 0,
    streaming: true,
  };

  const getProvider = vi.fn(() => model) as unknown as GetProviderFn;
  return { getProvider, invoke, stream };
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
