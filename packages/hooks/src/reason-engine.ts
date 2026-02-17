import { randomUUID } from "node:crypto";
import type {
  GetProviderFn,
  KortyxPromptMessage,
  KortyxStreamChunk,
  ProviderModelRef,
} from "@kortyx/providers";

export interface RunReasonEngineArgs {
  getProvider: GetProviderFn;
  model: ProviderModelRef;
  input: string;
  system?: string | undefined;
  temperature?: number | undefined;
  defaultTemperature?: number | undefined;
  stream?: boolean | undefined;
  emit?: boolean | undefined;
  nodeId?: string | undefined;
  emitEvent?: ((event: string, payload: unknown) => void) | undefined;
  id?: string | undefined;
  opId?: string | undefined;
  segmentId?: string | undefined;
}

export interface RunReasonEngineResult {
  text: string;
  raw?: unknown;
}

const chunkToText = (chunk: KortyxStreamChunk | string): string => {
  if (typeof chunk === "string") return chunk;
  if (typeof chunk.text === "string") return chunk.text;
  if (typeof chunk.content === "string") return chunk.content;
  return "";
};

const createRuntimeId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

const emitNodeEvent = (
  emitEvent: RunReasonEngineArgs["emitEvent"],
  nodeId: string | undefined,
  event: string,
  payload: Record<string, unknown>,
): void => {
  if (!emitEvent) return;
  emitEvent(event, {
    ...payload,
    ...(typeof nodeId === "string" && nodeId.length > 0
      ? { node: nodeId }
      : {}),
  });
};

export async function runReasonEngine(
  args: RunReasonEngineArgs,
): Promise<RunReasonEngineResult> {
  const stream = args.stream ?? args.model.options?.streaming ?? true;
  const emit = args.emit ?? true;
  const temperature =
    args.temperature ??
    args.model.options?.temperature ??
    args.defaultTemperature;

  const model = args.getProvider(args.model.providerId, args.model.modelId, {
    ...(temperature !== undefined ? { temperature } : {}),
    streaming: stream,
  });

  const messages: KortyxPromptMessage[] = [];
  if (typeof args.system === "string" && args.system.length > 0) {
    messages.push({ role: "system", content: args.system });
  }
  messages.push({ role: "user", content: String(args.input ?? "") });

  const opId =
    typeof args.opId === "string" && args.opId.length > 0
      ? args.opId
      : createRuntimeId();
  const segmentId =
    typeof args.segmentId === "string" && args.segmentId.length > 0
      ? args.segmentId
      : createRuntimeId();

  const commonMeta: Record<string, unknown> = {
    ...(typeof args.id === "string" && args.id.length > 0
      ? { id: args.id }
      : {}),
    opId,
    segmentId,
  };

  if (stream) {
    let final = "";
    let raw: unknown;

    if (emit) {
      emitNodeEvent(args.emitEvent, args.nodeId, "text-start", {
        ...commonMeta,
      });
    }

    const response = await model.stream(messages);
    for await (const chunk of response) {
      const text = chunkToText(chunk);
      if (!text) continue;
      final += text;
      if (typeof chunk === "object" && chunk && "raw" in chunk) {
        raw = (chunk as KortyxStreamChunk).raw;
      }
      if (emit) {
        emitNodeEvent(args.emitEvent, args.nodeId, "text-delta", {
          ...commonMeta,
          delta: text,
        });
      }
    }

    if (emit) {
      emitNodeEvent(args.emitEvent, args.nodeId, "text-end", {
        ...commonMeta,
      });
    }

    return {
      text: final,
      ...(raw !== undefined ? { raw } : {}),
    };
  }

  const response = await model.invoke(messages);

  if (emit) {
    emitNodeEvent(args.emitEvent, args.nodeId, "text-start", {
      ...commonMeta,
    });
    if (response.content) {
      emitNodeEvent(args.emitEvent, args.nodeId, "text-delta", {
        ...commonMeta,
        delta: response.content,
      });
    }
    emitNodeEvent(args.emitEvent, args.nodeId, "text-end", {
      ...commonMeta,
    });
  }

  return {
    text: response.content,
    ...(response.raw !== undefined ? { raw: response.raw } : {}),
  };
}
