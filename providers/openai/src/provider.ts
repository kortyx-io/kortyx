import type {
  KortyxFinishReason,
  KortyxInvokeResult,
  KortyxModel,
  KortyxPromptMessage,
  KortyxProviderMetadata,
  KortyxStreamPart,
  KortyxToolCall,
  KortyxUsage,
  KortyxWarning,
  ModelOptions,
  ProviderInstance,
  ProviderModelRef,
} from "@kortyx/providers";
import { createOpenAIClient } from "./client";
import {
  ProviderConfigurationError,
  requireApiKey,
  toProviderRequestError,
} from "./errors";
import { createChatCompletionRequest } from "./messages";
import { MODELS, type ModelId, PROVIDER_ID } from "./models";
import { createResponsesModel } from "./responses";
import type {
  OpenAIChatCompletionChunk,
  OpenAIChatCompletionResponse,
  OpenAIModelOptions,
  OpenAIUsage,
  ProviderSettings,
} from "./types";

const loadOpenAIApiKey = (apiKey: string | undefined): string => {
  if (apiKey !== undefined) {
    return requireApiKey(apiKey);
  }

  const envApiKey =
    process.env.OPENAI_API_KEY ?? process.env.KORTYX_OPENAI_API_KEY;

  if (!envApiKey || envApiKey.trim().length === 0) {
    throw new ProviderConfigurationError(
      "OpenAI provider requires an API key. Pass apiKey to createOpenAI(...) or set OPENAI_API_KEY or KORTYX_OPENAI_API_KEY.",
    );
  }

  return envApiKey;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const mapOpenAIFinishReason = (
  finishReason: string | null | undefined,
): KortyxFinishReason | undefined => {
  if (finishReason == null) return undefined;

  switch (finishReason) {
    case "stop":
      return { unified: "stop", raw: finishReason };
    case "length":
      return { unified: "length", raw: finishReason };
    case "content_filter":
      return { unified: "content-filter", raw: finishReason };
    case "function_call":
    case "tool_calls":
      return { unified: "tool-calls", raw: finishReason };
    default:
      return { unified: "other", raw: finishReason };
  }
};

const extractUsage = (
  usage: OpenAIUsage | null | undefined,
): KortyxUsage | undefined => {
  if (usage == null) return undefined;

  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? undefined;

  return {
    outputIncludesReasoning: true,
    inputIncludesCacheRead: true,
    ...(usage.prompt_tokens != null ? { input: usage.prompt_tokens } : {}),
    ...(usage.completion_tokens != null
      ? { output: usage.completion_tokens }
      : {}),
    ...(usage.total_tokens != null ? { total: usage.total_tokens } : {}),
    ...(reasoningTokens != null ? { reasoning: reasoningTokens } : {}),
    ...(usage.prompt_tokens_details?.cached_tokens != null
      ? { cacheRead: usage.prompt_tokens_details.cached_tokens }
      : {}),
    ...(isRecord(usage) ? { raw: usage } : {}),
  };
};

const extractResponseProviderMetadata = (
  modelId: ModelId,
  response: OpenAIChatCompletionResponse,
): KortyxProviderMetadata | undefined => {
  const usage = toRecord(response.usage);
  const metadata: KortyxProviderMetadata = {
    providerId: PROVIDER_ID,
    api: "chat-completions",
    modelId,
    ...(response.id !== undefined ? { responseId: response.id } : {}),
    ...(response.model !== undefined ? { responseModel: response.model } : {}),
    ...(response.created !== undefined ? { created: response.created } : {}),
    ...(usage !== undefined
      ? {
          usage,
          cachedTokens: toRecord(usage.prompt_tokens_details)?.cached_tokens,
          reasoningTokens: toRecord(usage.completion_tokens_details)
            ?.reasoning_tokens,
          acceptedPredictionTokens: toRecord(usage.completion_tokens_details)
            ?.accepted_prediction_tokens,
          rejectedPredictionTokens: toRecord(usage.completion_tokens_details)
            ?.rejected_prediction_tokens,
        }
      : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const extractChunkProviderMetadata = (
  modelId: ModelId,
  chunk: OpenAIChatCompletionChunk,
): KortyxProviderMetadata | undefined => {
  const usage = toRecord(chunk.usage);
  const metadata: KortyxProviderMetadata = {
    providerId: PROVIDER_ID,
    api: "chat-completions",
    modelId,
    ...(chunk.id !== undefined ? { responseId: chunk.id } : {}),
    ...(chunk.model !== undefined ? { responseModel: chunk.model } : {}),
    ...(chunk.created !== undefined ? { created: chunk.created } : {}),
    ...(usage !== undefined
      ? {
          usage,
          cachedTokens: toRecord(usage.prompt_tokens_details)?.cached_tokens,
          reasoningTokens: toRecord(usage.completion_tokens_details)
            ?.reasoning_tokens,
          acceptedPredictionTokens: toRecord(usage.completion_tokens_details)
            ?.accepted_prediction_tokens,
          rejectedPredictionTokens: toRecord(usage.completion_tokens_details)
            ?.rejected_prediction_tokens,
        }
      : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const extractText = (response: OpenAIChatCompletionResponse): string =>
  response.choices?.[0]?.message?.content ?? "";

const parseToolInput = (value: string | undefined): unknown => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const extractToolCalls = (
  response: OpenAIChatCompletionResponse,
): KortyxToolCall[] | undefined => {
  const toolCalls = response.choices?.[0]?.message?.tool_calls;
  if (!toolCalls?.length) return undefined;
  return toolCalls.map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.function.name,
    input: parseToolInput(toolCall.function.arguments),
    raw: toolCall,
  }));
};

const extractFinishReason = (
  response: OpenAIChatCompletionResponse,
): KortyxFinishReason | undefined =>
  mapOpenAIFinishReason(response.choices?.[0]?.finish_reason);

const isOpenAIReasoningModel = (modelId: string): boolean =>
  modelId.startsWith("o1") ||
  modelId.startsWith("o3") ||
  modelId.startsWith("o4-mini") ||
  (modelId.startsWith("gpt-5") && !modelId.startsWith("gpt-5-chat"));

const supportsNonReasoningParameters = (modelId: string): boolean =>
  modelId.startsWith("gpt-5.1") ||
  modelId.startsWith("gpt-5.2") ||
  modelId.startsWith("gpt-5.3") ||
  modelId.startsWith("gpt-5.4");

const collectWarnings = (
  modelId: ModelId,
  options: ModelOptions,
): KortyxWarning[] | undefined => {
  const warnings: KortyxWarning[] = [];

  if (
    isOpenAIReasoningModel(modelId) &&
    options.temperature !== undefined &&
    !(
      options.reasoning?.effort === "none" &&
      supportsNonReasoningParameters(modelId)
    )
  ) {
    warnings.push({
      type: "unsupported",
      feature: "temperature",
      details: "temperature is not supported for OpenAI reasoning models.",
    });
  }

  if (
    options.responseFormat?.type === "json" &&
    options.responseFormat.schema !== undefined &&
    options.providerOptions?.structuredOutputs === false
  ) {
    warnings.push({
      type: "unsupported",
      feature: "responseFormat",
      details:
        "OpenAI JSON schema response format is only supported when structuredOutputs is enabled.",
    });
  }

  if (
    options.reasoning?.effort !== undefined &&
    !["none", "minimal", "low", "medium", "high", "xhigh"].includes(
      options.reasoning.effort,
    )
  ) {
    warnings.push({
      type: "compatibility",
      feature: "reasoning.effort",
      details:
        "The requested reasoning effort is forwarded unchanged; the selected OpenAI model may reject it.",
    });
  }

  if (options.reasoning?.maxTokens !== undefined) {
    warnings.push({
      type: "compatibility",
      feature: "reasoning.maxTokens",
      details:
        "OpenAI chat completions do not expose a separate reasoning token budget. Kortyx maps maxOutputTokens to max_completion_tokens for reasoning models.",
    });
  }

  const providerOptions = options.providerOptions;
  const allowedProviderOptions = new Set([
    "openai",
    "api",
    "reasoningEffort",
    "maxCompletionTokens",
    "serviceTier",
    "store",
    "metadata",
    "systemMessageMode",
    "structuredOutputs",
    "strictJsonSchema",
  ]);
  if (
    providerOptions &&
    Object.keys(providerOptions).some((key) => !allowedProviderOptions.has(key))
  ) {
    warnings.push({
      type: "unsupported",
      feature: "providerOptions",
      details:
        "OpenAI provider currently maps reasoningEffort, maxCompletionTokens, serviceTier, store, metadata, systemMessageMode, structuredOutputs, and strictJsonSchema.",
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

const createFinishPart = (
  modelId: ModelId,
  chunk: OpenAIChatCompletionChunk | undefined,
  warnings: KortyxWarning[] | undefined,
): KortyxStreamPart => {
  const finishReason = mapOpenAIFinishReason(
    chunk?.choices?.[0]?.finish_reason,
  );
  const usage = extractUsage(chunk?.usage);
  const providerMetadata =
    chunk !== undefined
      ? extractChunkProviderMetadata(modelId, chunk)
      : undefined;

  return {
    type: "finish",
    ...(chunk !== undefined ? { raw: chunk } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
    ...(warnings ? { warnings } : {}),
  };
};

const createResponseFinishPart = (
  modelId: ModelId,
  response: OpenAIChatCompletionResponse,
  warnings: KortyxWarning[] | undefined,
): KortyxStreamPart => {
  const finishReason = extractFinishReason(response);
  const usage = extractUsage(response.usage);
  const providerMetadata = extractResponseProviderMetadata(modelId, response);
  const toolCalls = extractToolCalls(response);

  return {
    type: "finish",
    raw: response,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
    ...(toolCalls ? { toolCalls } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
    ...(warnings ? { warnings } : {}),
  };
};

const createOpenAIModel = (
  modelId: ModelId,
  settings: ProviderSettings,
  options: ModelOptions = {},
): KortyxModel => {
  let client: ReturnType<typeof createOpenAIClient> | undefined;

  const getClient = () => {
    if (!client) {
      client = createOpenAIClient({
        apiKey: loadOpenAIApiKey(settings.apiKey),
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
    ...(options.tools !== undefined ? { tools: options.tools } : {}),
    ...(options.providerOptions !== undefined
      ? { providerOptions: options.providerOptions }
      : {}),
  };
  const warnings = collectWarnings(modelId, resolvedOptions);

  return {
    supportsToolStreaming: true,
    async *stream(messages: KortyxPromptMessage[]) {
      const client = getClient();
      const request = createChatCompletionRequest(
        modelId,
        messages,
        resolvedOptions,
        resolvedOptions.streaming !== false,
      );

      try {
        if (resolvedOptions.streaming !== false) {
          let lastChunk: OpenAIChatCompletionChunk | undefined;
          let finishReason: string | null | undefined;
          const calls = new Map<
            number,
            { id: string; name: string; arguments: string }
          >();
          for await (const chunk of client.streamChatCompletion(request, {
            ...(resolvedOptions.abortSignal
              ? { signal: resolvedOptions.abortSignal }
              : {}),
          })) {
            if (chunk.error?.message) {
              yield {
                type: "error",
                error: new Error(chunk.error.message),
                raw: chunk,
              } satisfies KortyxStreamPart;
              return;
            }

            finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;
            lastChunk = {
              ...chunk,
              usage: chunk.usage ?? lastChunk?.usage,
              choices: [{ finish_reason: finishReason }],
            };
            for (const [position, delta] of (
              chunk.choices?.[0]?.delta?.tool_calls ?? []
            ).entries()) {
              const index = (delta as { index?: number }).index ?? position;
              const call = calls.get(index) ?? {
                id: "",
                name: "",
                arguments: "",
              };
              call.id = delta.id ?? call.id;
              call.name += delta.function?.name ?? "";
              call.arguments += delta.function?.arguments ?? "";
              calls.set(index, call);
            }
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield createTextDeltaPart(delta, chunk);
          }

          if (!finishReason)
            throw new Error(
              "OpenAI Chat Completions stream ended without a finish reason.",
            );
          yield {
            ...createFinishPart(modelId, lastChunk, warnings),
            ...(calls.size
              ? {
                  toolCalls: [...calls.values()].map((call) => {
                    if (!call.id || !call.name)
                      throw new Error(
                        "OpenAI returned an incomplete streamed function call.",
                      );
                    return {
                      id: call.id,
                      name: call.name,
                      input: JSON.parse(call.arguments) as unknown,
                    };
                  }),
                }
              : {}),
          };
          return;
        }

        const response = await client.createChatCompletion(request, {
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
        const request = createChatCompletionRequest(
          modelId,
          messages,
          resolvedOptions,
          false,
        );
        const result = await client.createChatCompletion(request, {
          ...(resolvedOptions.abortSignal
            ? { signal: resolvedOptions.abortSignal }
            : {}),
        });
        const usage = extractUsage(result.usage);
        const finishReason = extractFinishReason(result);
        const providerMetadata = extractResponseProviderMetadata(
          modelId,
          result,
        );
        const toolCalls = extractToolCalls(result);
        return {
          role: "assistant",
          content: extractText(result),
          raw: result,
          ...(usage ? { usage } : {}),
          ...(finishReason ? { finishReason } : {}),
          ...(toolCalls ? { toolCalls } : {}),
          ...(providerMetadata ? { providerMetadata } : {}),
          ...(warnings ? { warnings } : {}),
        };
      } catch (error) {
        throw toProviderRequestError("invoke content", error);
      }
    },
  };
};

export type OpenAIModelRef = ProviderModelRef<typeof PROVIDER_ID, ModelId>;
export interface OpenAIProvider
  extends ProviderInstance<typeof PROVIDER_ID, ModelId> {
  (modelId: ModelId, options?: OpenAIModelOptions): OpenAIModelRef;
  getModel: (modelId: string, options?: OpenAIModelOptions) => KortyxModel;
}

export function createOpenAI(settings: ProviderSettings = {}): OpenAIProvider {
  const getModel = (
    modelId: string,
    options?: OpenAIModelOptions,
  ): KortyxModel => {
    if (modelId.trim().length === 0) {
      throw new Error("OpenAI model id must be a non-empty string.");
    }

    const nested = options?.providerOptions?.openai;
    const providerOptions =
      nested && typeof nested === "object"
        ? (nested as Record<string, unknown>)
        : options?.providerOptions;
    const api =
      options?.api ?? providerOptions?.api ?? settings.api ?? "responses";
    if (api === "responses")
      return createResponsesModel(modelId, settings, options ?? {}, () =>
        loadOpenAIApiKey(settings.apiKey),
      );
    if (api === "chat-completions")
      return createOpenAIModel(modelId, settings, options);
    throw new ProviderConfigurationError(`Unknown OpenAI API: ${String(api)}`);
  };

  const provider = Object.assign(
    ((modelId: ModelId, options?: OpenAIModelOptions) => {
      if (modelId.trim().length === 0) {
        throw new Error("OpenAI model id must be a non-empty string.");
      }

      return {
        provider,
        modelId,
        ...(options
          ? {
              options: {
                ...options,
                ...(options.api
                  ? {
                      providerOptions: {
                        ...options.providerOptions,
                        openai: {
                          ...(options.providerOptions?.openai as
                            | Record<string, unknown>
                            | undefined),
                          api: options.api,
                        },
                      },
                    }
                  : {}),
              },
            }
          : {}),
      } satisfies OpenAIModelRef;
    }) as unknown as OpenAIProvider,
    {
      id: PROVIDER_ID,
      models: MODELS,
      getModel,
    },
  );

  return provider;
}

export const openai = createOpenAI();
