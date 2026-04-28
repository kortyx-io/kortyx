import type {
  KortyxFinishReason,
  KortyxInvokeResult,
  KortyxModel,
  KortyxPromptMessage,
  KortyxProviderMetadata,
  KortyxStreamPart,
  KortyxUsage,
  KortyxWarning,
  ModelOptions,
  ProviderModelRef,
  ProviderSelector,
} from "@kortyx/providers";
import { createAnthropicClient } from "./client";
import {
  ProviderConfigurationError,
  requireSecret,
  toProviderRequestError,
} from "./errors";
import { createMessagesRequest, getThinkingRequest } from "./messages";
import { MODELS, type ModelId, PROVIDER_ID } from "./models";
import type {
  AnthropicContentBlock,
  AnthropicMessagesResponse,
  AnthropicStreamEvent,
  AnthropicUsage,
  ProviderSettings,
} from "./types";

type AnthropicCredentials =
  | { apiKey: string; authToken?: never }
  | { authToken: string; apiKey?: never };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const loadAnthropicCredentials = (
  settings: ProviderSettings,
): AnthropicCredentials => {
  const apiKey =
    settings.apiKey ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.KORTYX_ANTHROPIC_API_KEY;
  const authToken =
    settings.authToken ??
    process.env.ANTHROPIC_AUTH_TOKEN ??
    process.env.KORTYX_ANTHROPIC_AUTH_TOKEN;

  const hasApiKey = apiKey !== undefined && apiKey.trim().length > 0;
  const hasAuthToken = authToken !== undefined && authToken.trim().length > 0;

  if (hasApiKey && hasAuthToken) {
    throw new ProviderConfigurationError(
      "Anthropic provider accepts either apiKey or authToken, not both.",
    );
  }

  if (hasAuthToken) {
    return { authToken: requireSecret(authToken, "auth token") };
  }

  if (hasApiKey) {
    return { apiKey: requireSecret(apiKey, "API key") };
  }

  throw new ProviderConfigurationError(
    "Anthropic provider requires an API key. Pass apiKey to createAnthropic(...) or set ANTHROPIC_API_KEY or KORTYX_ANTHROPIC_API_KEY.",
  );
};

const mapAnthropicFinishReason = (
  finishReason: string | null | undefined,
): KortyxFinishReason | undefined => {
  if (finishReason == null) return undefined;

  switch (finishReason) {
    case "end_turn":
    case "stop_sequence":
    case "pause_turn":
      return { unified: "stop", raw: finishReason };
    case "max_tokens":
    case "model_context_window_exceeded":
      return { unified: "length", raw: finishReason };
    case "refusal":
      return { unified: "content-filter", raw: finishReason };
    case "tool_use":
      return { unified: "tool-calls", raw: finishReason };
    default:
      return { unified: "other", raw: finishReason };
  }
};

const addOptionalNumbers = (...values: Array<number | null | undefined>) => {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) return undefined;
  return present.reduce((sum, value) => sum + value, 0);
};

const mergeAnthropicUsage = (
  left: AnthropicUsage | null | undefined,
  right: AnthropicUsage | null | undefined,
): AnthropicUsage | undefined => {
  if (left == null) return right ?? undefined;
  if (right == null) return left;
  return {
    ...left,
    ...right,
    input_tokens: right.input_tokens ?? left.input_tokens,
    output_tokens: right.output_tokens ?? left.output_tokens,
    cache_creation_input_tokens:
      right.cache_creation_input_tokens ?? left.cache_creation_input_tokens,
    cache_read_input_tokens:
      right.cache_read_input_tokens ?? left.cache_read_input_tokens,
  };
};

const extractUsage = (
  usage: AnthropicUsage | null | undefined,
): KortyxUsage | undefined => {
  if (usage == null) return undefined;

  const cacheWrite = usage.cache_creation_input_tokens ?? undefined;
  const cacheRead = usage.cache_read_input_tokens ?? undefined;
  const input = addOptionalNumbers(
    usage.input_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
  );
  const output = usage.output_tokens ?? undefined;
  const total = addOptionalNumbers(input, output);

  return {
    ...(input != null ? { input } : {}),
    ...(output != null ? { output } : {}),
    ...(total != null ? { total } : {}),
    ...(cacheRead != null ? { cacheRead } : {}),
    ...(cacheWrite != null ? { cacheWrite } : {}),
    ...(isRecord(usage) ? { raw: usage } : {}),
  };
};

const extractText = (response: AnthropicMessagesResponse): string =>
  response.content
    ?.filter(
      (
        block,
      ): block is AnthropicContentBlock & { type: "text"; text: string } =>
        block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("") ?? "";

const extractResponseProviderMetadata = (
  modelId: ModelId,
  response: AnthropicMessagesResponse,
): KortyxProviderMetadata | undefined => {
  const usage = toRecord(response.usage);
  const metadata: KortyxProviderMetadata = {
    providerId: PROVIDER_ID,
    modelId,
    ...(response.id !== undefined ? { responseId: response.id } : {}),
    ...(response.model !== undefined ? { responseModel: response.model } : {}),
    ...(response.stop_sequence !== undefined && response.stop_sequence !== null
      ? { stopSequence: response.stop_sequence }
      : {}),
    ...(usage !== undefined
      ? {
          usage,
          cacheReadTokens: usage.cache_read_input_tokens,
          cacheWriteTokens: usage.cache_creation_input_tokens,
          serverToolUse: usage.server_tool_use,
        }
      : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const extractStreamProviderMetadata = (
  modelId: ModelId,
  message: AnthropicMessagesResponse | undefined,
  usage: AnthropicUsage | undefined,
  stopSequence: string | null | undefined,
): KortyxProviderMetadata | undefined => {
  const usageRecord = toRecord(usage);
  const metadata: KortyxProviderMetadata = {
    providerId: PROVIDER_ID,
    modelId,
    ...(message?.id !== undefined ? { responseId: message.id } : {}),
    ...(message?.model !== undefined ? { responseModel: message.model } : {}),
    ...(stopSequence !== undefined && stopSequence !== null
      ? { stopSequence }
      : {}),
    ...(usageRecord !== undefined
      ? {
          usage: usageRecord,
          cacheReadTokens: usageRecord.cache_read_input_tokens,
          cacheWriteTokens: usageRecord.cache_creation_input_tokens,
          serverToolUse: usageRecord.server_tool_use,
        }
      : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const getProviderOptions = (
  options: ModelOptions,
): Record<string, unknown> | undefined => {
  const providerOptions = options.providerOptions;
  if (!providerOptions) return undefined;
  const nested = providerOptions.anthropic;
  if (isRecord(nested)) return nested;
  return providerOptions;
};

const collectWarnings = (
  options: ModelOptions,
): KortyxWarning[] | undefined => {
  const warnings: KortyxWarning[] = [];
  const thinking = getThinkingRequest(options);

  if (thinking?.type === "enabled" && options.temperature !== undefined) {
    warnings.push({
      type: "unsupported",
      feature: "temperature",
      details:
        "Anthropic extended thinking does not support temperature. Kortyx omits temperature when thinking is enabled.",
    });
  }

  if (options.responseFormat?.type === "json") {
    warnings.push({
      type: "compatibility",
      feature: "responseFormat",
      details:
        "Anthropic does not expose a provider-native JSON schema response format in this provider. Kortyx maps JSON mode through system instructions.",
    });
  }

  if (
    options.reasoning?.effort !== undefined &&
    options.reasoning.maxTokens === undefined
  ) {
    warnings.push({
      type: "compatibility",
      feature: "reasoning.effort",
      details:
        "Anthropic uses a thinking token budget. Kortyx maps generic reasoning effort to the minimum supported thinking budget.",
    });
  }

  const providerOptions = options.providerOptions;
  const allowedProviderOptions = new Set([
    "anthropic",
    "thinking",
    "topK",
    "top_k",
    "topP",
    "top_p",
  ]);
  if (
    providerOptions &&
    Object.keys(providerOptions).some((key) => !allowedProviderOptions.has(key))
  ) {
    warnings.push({
      type: "unsupported",
      feature: "providerOptions",
      details:
        "Anthropic provider currently maps thinking, topK/top_k, and topP/top_p.",
    });
  }

  const nestedProviderOptions = getProviderOptions(options);
  if (
    providerOptions?.anthropic !== undefined &&
    nestedProviderOptions &&
    Object.keys(nestedProviderOptions).some(
      (key) => !allowedProviderOptions.has(key),
    )
  ) {
    warnings.push({
      type: "unsupported",
      feature: "providerOptions.anthropic",
      details:
        "Anthropic provider currently maps thinking, topK/top_k, and topP/top_p.",
    });
  }

  return warnings.length > 0 ? warnings : undefined;
};

const createTextDeltaPart = (
  delta: string,
  raw: unknown,
): KortyxStreamPart => ({
  type: "text-delta",
  delta,
  raw,
});

const createResponseFinishPart = (
  modelId: ModelId,
  response: AnthropicMessagesResponse,
  warnings: KortyxWarning[] | undefined,
): KortyxStreamPart => {
  const finishReason = mapAnthropicFinishReason(response.stop_reason);
  const usage = extractUsage(response.usage);
  const providerMetadata = extractResponseProviderMetadata(modelId, response);

  return {
    type: "finish",
    raw: response,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
    ...(warnings ? { warnings } : {}),
  };
};

const createStreamFinishPart = (
  modelId: ModelId,
  message: AnthropicMessagesResponse | undefined,
  usage: AnthropicUsage | undefined,
  finishReasonRaw: string | null | undefined,
  stopSequence: string | null | undefined,
  raw: unknown,
  warnings: KortyxWarning[] | undefined,
): KortyxStreamPart => {
  const finishReason = mapAnthropicFinishReason(finishReasonRaw);
  const normalizedUsage = extractUsage(usage);
  const providerMetadata = extractStreamProviderMetadata(
    modelId,
    message,
    usage,
    stopSequence,
  );

  return {
    type: "finish",
    ...(raw !== undefined ? { raw } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(normalizedUsage ? { usage: normalizedUsage } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
    ...(warnings ? { warnings } : {}),
  };
};

const createAnthropicModel = (
  modelId: ModelId,
  settings: ProviderSettings,
  options: ModelOptions = {},
): KortyxModel => {
  let client: ReturnType<typeof createAnthropicClient> | undefined;

  const getClient = () => {
    if (!client) {
      client = createAnthropicClient({
        ...loadAnthropicCredentials(settings),
        baseUrl: settings.baseUrl,
        fetch: settings.fetch,
      });
    }

    return client;
  };

  const resolvedOptions: ModelOptions = {
    streaming: options.streaming ?? true,
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options.maxOutputTokens !== undefined
      ? { maxOutputTokens: options.maxOutputTokens }
      : {}),
    ...(options.stopSequences !== undefined
      ? { stopSequences: options.stopSequences }
      : {}),
    ...(options.abortSignal !== undefined
      ? { abortSignal: options.abortSignal }
      : {}),
    ...(options.reasoning !== undefined
      ? { reasoning: options.reasoning }
      : {}),
    ...(options.responseFormat !== undefined
      ? { responseFormat: options.responseFormat }
      : {}),
    ...(options.providerOptions !== undefined
      ? { providerOptions: options.providerOptions }
      : {}),
  };
  const warnings = collectWarnings(resolvedOptions);

  return {
    async *stream(messages: KortyxPromptMessage[]) {
      const client = getClient();
      const request = createMessagesRequest(
        modelId,
        messages,
        resolvedOptions,
        resolvedOptions.streaming !== false,
      );

      try {
        if (resolvedOptions.streaming !== false) {
          let message: AnthropicMessagesResponse | undefined;
          let usage: AnthropicUsage | undefined;
          let finishReasonRaw: string | null | undefined;
          let stopSequence: string | null | undefined;
          let lastEvent: AnthropicStreamEvent | undefined;

          for await (const event of client.streamMessage(request, {
            ...(resolvedOptions.abortSignal
              ? { signal: resolvedOptions.abortSignal }
              : {}),
          })) {
            lastEvent = event;

            if (event.type === "error") {
              yield {
                type: "error",
                error: new Error(
                  event.error?.message ?? "Anthropic stream error.",
                ),
                raw: event,
              } satisfies KortyxStreamPart;
              return;
            }

            if (event.type === "message_start") {
              message = event.message;
              usage = mergeAnthropicUsage(usage, event.message?.usage);
              continue;
            }

            if (event.type === "content_block_delta") {
              const delta = event.delta;
              if (
                delta?.type === "text_delta" &&
                typeof delta.text === "string" &&
                delta.text.length > 0
              ) {
                yield createTextDeltaPart(delta.text, event);
              }
              continue;
            }

            if (event.type === "message_delta") {
              usage = mergeAnthropicUsage(usage, event.usage);
              finishReasonRaw = event.delta?.stop_reason;
              stopSequence = event.delta?.stop_sequence;
            }
          }

          yield createStreamFinishPart(
            modelId,
            message,
            usage,
            finishReasonRaw ?? message?.stop_reason,
            stopSequence ?? message?.stop_sequence,
            lastEvent,
            warnings,
          );
          return;
        }

        const response = await client.createMessage(request, {
          ...(resolvedOptions.abortSignal
            ? { signal: resolvedOptions.abortSignal }
            : {}),
        });
        const text = extractText(response);
        if (text) yield createTextDeltaPart(text, response);
        yield createResponseFinishPart(modelId, response, warnings);
      } catch (error) {
        yield {
          type: "error",
          error: toProviderRequestError("stream content", error),
        } satisfies KortyxStreamPart;
      }
    },

    async invoke(messages: KortyxPromptMessage[]): Promise<KortyxInvokeResult> {
      try {
        const client = getClient();
        const request = createMessagesRequest(
          modelId,
          messages,
          resolvedOptions,
          false,
        );
        const result = await client.createMessage(request, {
          ...(resolvedOptions.abortSignal
            ? { signal: resolvedOptions.abortSignal }
            : {}),
        });
        const usage = extractUsage(result.usage);
        const finishReason = mapAnthropicFinishReason(result.stop_reason);
        const providerMetadata = extractResponseProviderMetadata(
          modelId,
          result,
        );
        return {
          role: "assistant",
          content: extractText(result),
          raw: result,
          ...(usage ? { usage } : {}),
          ...(finishReason ? { finishReason } : {}),
          ...(providerMetadata ? { providerMetadata } : {}),
          ...(warnings ? { warnings } : {}),
        };
      } catch (error) {
        throw toProviderRequestError("invoke content", error);
      }
    },
  };
};

export type AnthropicModelRef = ProviderModelRef<typeof PROVIDER_ID, ModelId>;
export type AnthropicProvider = ProviderSelector<typeof PROVIDER_ID, ModelId>;

export function createAnthropic(
  settings: ProviderSettings = {},
): AnthropicProvider {
  const getModel = (modelId: string, options?: ModelOptions): KortyxModel => {
    if (modelId.trim().length === 0) {
      throw new Error("Anthropic model id must be a non-empty string.");
    }

    return createAnthropicModel(modelId, settings, options);
  };

  const provider = Object.assign(
    ((modelId: ModelId, options?: ModelOptions) => {
      if (modelId.trim().length === 0) {
        throw new Error("Anthropic model id must be a non-empty string.");
      }

      return {
        provider,
        modelId,
        ...(options ? { options } : {}),
      } satisfies AnthropicModelRef;
    }) as unknown as AnthropicProvider,
    {
      id: PROVIDER_ID,
      models: MODELS,
      getModel,
    },
  );

  return provider;
}

export const anthropic = createAnthropic();
