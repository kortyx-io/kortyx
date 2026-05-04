import { randomUUID } from "node:crypto";
import type {
  KortyxFinishReason,
  KortyxPromptMessage,
  KortyxProviderMetadata,
  KortyxReasoningOptions,
  KortyxResponseFormat,
  KortyxUsage,
  KortyxWarning,
  ProviderModelRef,
} from "@kortyx/providers";
import type { ReasonTraceAdapter, ReasonTraceSpan } from "./tracing";

export interface RunReasonEngineArgs {
  model: ProviderModelRef;
  input: string;
  system?: string | undefined;
  temperature?: number | undefined;
  maxOutputTokens?: number | undefined;
  stopSequences?: string[] | undefined;
  abortSignal?: AbortSignal | undefined;
  reasoning?: KortyxReasoningOptions | undefined;
  responseFormat?: KortyxResponseFormat | undefined;
  providerOptions?: Record<string, unknown> | undefined;
  defaultTemperature?: number | undefined;
  stream?: boolean | undefined;
  emit?: boolean | undefined;
  nodeId?: string | undefined;
  emitEvent?: ((event: string, payload: unknown) => void) | undefined;
  onTextChunk?: ((text: string) => void) | undefined;
  id?: string | undefined;
  opId?: string | undefined;
  segmentId?: string | undefined;
  reasonTrace?: ReasonTraceAdapter | undefined;
}

export interface RunReasonEngineResult {
  text: string;
  raw?: unknown;
  usage?: KortyxUsage;
  finishReason?: KortyxFinishReason;
  providerMetadata?: KortyxProviderMetadata;
  warnings?: KortyxWarning[];
}

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

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
  const maxOutputTokens =
    args.maxOutputTokens ?? args.model.options?.maxOutputTokens;
  const stopSequences = args.stopSequences ?? args.model.options?.stopSequences;
  const abortSignal = args.abortSignal ?? args.model.options?.abortSignal;
  const reasoning = args.reasoning ?? args.model.options?.reasoning;
  const responseFormat =
    args.responseFormat ?? args.model.options?.responseFormat;
  const providerOptions =
    args.providerOptions ?? args.model.options?.providerOptions;

  const model = args.model.provider.getModel(args.model.modelId, {
    ...(temperature !== undefined ? { temperature } : {}),
    streaming: stream,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(stopSequences !== undefined ? { stopSequences } : {}),
    ...(abortSignal !== undefined ? { abortSignal } : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(responseFormat !== undefined ? { responseFormat } : {}),
    ...(providerOptions !== undefined ? { providerOptions } : {}),
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
  const traceSpan = args.reasonTrace?.startSpan({
    name: "runReasonEngine",
    attributes: {
      ...commonMeta,
      providerId: args.model.provider.id,
      modelId: args.model.modelId,
      stream,
      emit,
      ...(typeof args.nodeId === "string" && args.nodeId.length > 0
        ? { nodeId: args.nodeId }
        : {}),
    },
  });

  const endTrace = (
    span: ReasonTraceSpan | undefined,
    result: RunReasonEngineResult,
  ): void => {
    span?.end?.({
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
      ...(result.finishReason !== undefined
        ? { finishReason: result.finishReason }
        : {}),
      ...(result.providerMetadata !== undefined
        ? { providerMetadata: result.providerMetadata }
        : {}),
      ...(result.warnings !== undefined ? { warnings: result.warnings } : {}),
      attributes: {
        textLength: result.text.length,
      },
    });
  };

  const failTrace = (
    span: ReasonTraceSpan | undefined,
    error: unknown,
  ): void => {
    span?.fail?.(error, {
      attributes: {
        providerId: args.model.provider.id,
        modelId: args.model.modelId,
      },
    });
  };

  try {
    if (stream) {
      let final = "";
      let raw: unknown;
      let usage: KortyxUsage | undefined;
      let finishReason: KortyxFinishReason | undefined;
      let providerMetadata: KortyxProviderMetadata | undefined;
      let warnings: KortyxWarning[] | undefined;

      if (emit) {
        emitNodeEvent(args.emitEvent, args.nodeId, "text-start", {
          ...commonMeta,
        });
      }

      const response = await model.stream(messages);
      for await (const chunk of response) {
        switch (chunk.type) {
          case "text-delta": {
            if (chunk.delta.length === 0) break;
            final += chunk.delta;
            args.onTextChunk?.(chunk.delta);
            if (chunk.raw !== undefined) {
              raw = chunk.raw;
            }
            if (chunk.providerMetadata !== undefined) {
              providerMetadata = chunk.providerMetadata;
            }
            if (emit) {
              emitNodeEvent(args.emitEvent, args.nodeId, "text-delta", {
                ...commonMeta,
                delta: chunk.delta,
              });
            }
            break;
          }
          case "finish": {
            if (chunk.raw !== undefined) {
              raw = chunk.raw;
            }
            if (chunk.usage !== undefined) {
              usage = chunk.usage;
            }
            if (chunk.finishReason !== undefined) {
              finishReason = chunk.finishReason;
            }
            if (chunk.providerMetadata !== undefined) {
              providerMetadata = chunk.providerMetadata;
            }
            if (chunk.warnings !== undefined) {
              warnings = chunk.warnings;
            }
            break;
          }
          case "raw": {
            raw = chunk.raw;
            if (chunk.providerMetadata !== undefined) {
              providerMetadata = chunk.providerMetadata;
            }
            break;
          }
          case "error": {
            if (chunk.raw !== undefined) {
              raw = chunk.raw;
            }
            if (chunk.providerMetadata !== undefined) {
              providerMetadata = chunk.providerMetadata;
            }
            if (chunk.warnings !== undefined) {
              warnings = chunk.warnings;
            }
            throw toError(chunk.error);
          }
        }
      }

      if (emit) {
        emitNodeEvent(args.emitEvent, args.nodeId, "text-end", {
          ...commonMeta,
        });
      }

      const result = {
        text: final,
        ...(raw !== undefined ? { raw } : {}),
        ...(usage !== undefined ? { usage } : {}),
        ...(finishReason !== undefined ? { finishReason } : {}),
        ...(providerMetadata !== undefined ? { providerMetadata } : {}),
        ...(warnings !== undefined ? { warnings } : {}),
      };
      endTrace(traceSpan, result);
      return result;
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

    const result = {
      text: response.content,
      ...(response.raw !== undefined ? { raw: response.raw } : {}),
      ...(response.usage !== undefined ? { usage: response.usage } : {}),
      ...(response.finishReason !== undefined
        ? { finishReason: response.finishReason }
        : {}),
      ...(response.providerMetadata !== undefined
        ? { providerMetadata: response.providerMetadata }
        : {}),
      ...(response.warnings !== undefined
        ? { warnings: response.warnings }
        : {}),
    };
    endTrace(traceSpan, result);
    return result;
  } catch (error) {
    failTrace(traceSpan, error);
    throw error;
  }
}
