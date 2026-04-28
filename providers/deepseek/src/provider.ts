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
import { createDeepSeekClient } from "./client";
import {
  ProviderConfigurationError,
  requireApiKey,
  toProviderRequestError,
} from "./errors";
import { createChatCompletionRequest } from "./messages";
import { MODELS, type ModelId, PROVIDER_ID } from "./models";
import type {
  DeepSeekChatCompletionChunk,
  DeepSeekChatCompletionResponse,
  DeepSeekUsage,
  ProviderSettings,
} from "./types";

const loadDeepSeekApiKey = (apiKey: string | undefined): string => {
  if (apiKey !== undefined) {
    return requireApiKey(apiKey);
  }

  const envApiKey =
    process.env.DEEPSEEK_API_KEY ?? process.env.KORTYX_DEEPSEEK_API_KEY;

  if (!envApiKey || envApiKey.trim().length === 0) {
    throw new ProviderConfigurationError(
      "DeepSeek provider requires an API key. Pass apiKey to createDeepSeek(...) or set DEEPSEEK_API_KEY or KORTYX_DEEPSEEK_API_KEY.",
    );
  }

  return envApiKey;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const mapDeepSeekFinishReason = (
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
    case "tool_calls":
      return { unified: "tool-calls", raw: finishReason };
    case "insufficient_system_resource":
      return { unified: "error", raw: finishReason };
    default:
      return { unified: "other", raw: finishReason };
  }
};

const extractUsage = (
  usage: DeepSeekUsage | null | undefined,
): KortyxUsage | undefined => {
  if (usage == null) return undefined;

  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? undefined;

  return {
    ...(usage.prompt_tokens != null ? { input: usage.prompt_tokens } : {}),
    ...(usage.completion_tokens != null
      ? { output: usage.completion_tokens }
      : {}),
    ...(usage.total_tokens != null ? { total: usage.total_tokens } : {}),
    ...(reasoningTokens != null ? { reasoning: reasoningTokens } : {}),
    ...(usage.prompt_cache_hit_tokens != null
      ? { cacheRead: usage.prompt_cache_hit_tokens }
      : {}),
    ...(isRecord(usage) ? { raw: usage } : {}),
  };
};

const extractResponseProviderMetadata = (
  modelId: ModelId,
  response: DeepSeekChatCompletionResponse,
): KortyxProviderMetadata | undefined => {
  const usage = toRecord(response.usage);
  const metadata: KortyxProviderMetadata = {
    providerId: PROVIDER_ID,
    modelId,
    ...(response.id !== undefined ? { responseId: response.id } : {}),
    ...(response.model !== undefined ? { responseModel: response.model } : {}),
    ...(response.created !== undefined ? { created: response.created } : {}),
    ...(usage !== undefined
      ? {
          usage,
          promptCacheHitTokens: usage.prompt_cache_hit_tokens,
          promptCacheMissTokens: usage.prompt_cache_miss_tokens,
        }
      : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const extractChunkProviderMetadata = (
  modelId: ModelId,
  chunk: DeepSeekChatCompletionChunk,
): KortyxProviderMetadata | undefined => {
  const usage = toRecord(chunk.usage);
  const metadata: KortyxProviderMetadata = {
    providerId: PROVIDER_ID,
    modelId,
    ...(chunk.id !== undefined ? { responseId: chunk.id } : {}),
    ...(chunk.model !== undefined ? { responseModel: chunk.model } : {}),
    ...(chunk.created !== undefined ? { created: chunk.created } : {}),
    ...(usage !== undefined
      ? {
          usage,
          promptCacheHitTokens: usage.prompt_cache_hit_tokens,
          promptCacheMissTokens: usage.prompt_cache_miss_tokens,
        }
      : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const extractText = (response: DeepSeekChatCompletionResponse): string =>
  response.choices?.[0]?.message?.content ?? "";

const extractFinishReason = (
  response: DeepSeekChatCompletionResponse,
): KortyxFinishReason | undefined =>
  mapDeepSeekFinishReason(response.choices?.[0]?.finish_reason);

const collectWarnings = (
  options: ModelOptions,
): KortyxWarning[] | undefined => {
  const warnings: KortyxWarning[] = [];

  if (
    options.responseFormat?.type === "json" &&
    options.responseFormat.schema !== undefined
  ) {
    warnings.push({
      type: "compatibility",
      feature: "responseFormat.schema",
      details:
        "DeepSeek supports JSON mode but not generic JSON schema enforcement. Kortyx injects the schema into a system message.",
    });
  }

  if (
    options.reasoning?.effort !== undefined &&
    !["none", "minimal", "low", "medium", "high"].includes(
      options.reasoning.effort,
    )
  ) {
    warnings.push({
      type: "compatibility",
      feature: "reasoning.effort",
      details:
        "DeepSeek only supports enabling or disabling thinking. Kortyx maps generic reasoning options to thinking.enabled.",
    });
  }

  if (options.reasoning?.maxTokens !== undefined) {
    warnings.push({
      type: "unsupported",
      feature: "reasoning.maxTokens",
      details:
        "DeepSeek does not expose a generic thinking token budget through the chat completions API.",
    });
  }

  const providerOptions = options.providerOptions;
  if (
    providerOptions &&
    Object.keys(providerOptions).some((key) => key !== "thinking")
  ) {
    warnings.push({
      type: "unsupported",
      feature: "providerOptions",
      details:
        "DeepSeek provider currently only maps providerOptions.thinking.",
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
  chunk: DeepSeekChatCompletionChunk | undefined,
  warnings: KortyxWarning[] | undefined,
): KortyxStreamPart => {
  const finishReason = mapDeepSeekFinishReason(
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
  response: DeepSeekChatCompletionResponse,
  warnings: KortyxWarning[] | undefined,
): KortyxStreamPart => {
  const finishReason = extractFinishReason(response);
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

const createDeepSeekModel = (
  modelId: ModelId,
  settings: ProviderSettings,
  options: ModelOptions = {},
): KortyxModel => {
  let client: ReturnType<typeof createDeepSeekClient> | undefined;

  const getClient = () => {
    if (!client) {
      client = createDeepSeekClient({
        apiKey: loadDeepSeekApiKey(settings.apiKey),
        baseUrl: settings.baseUrl,
        fetch: settings.fetch,
      });
    }

    return client;
  };

  const resolvedOptions: ModelOptions = {
    temperature: options.temperature ?? 0.7,
    streaming: options.streaming ?? true,
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
      const request = createChatCompletionRequest(
        modelId,
        messages,
        resolvedOptions,
        resolvedOptions.streaming !== false,
      );

      try {
        if (resolvedOptions.streaming !== false) {
          let lastChunk: DeepSeekChatCompletionChunk | undefined;
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

            lastChunk = chunk;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield createTextDeltaPart(delta, chunk);
          }

          yield createFinishPart(modelId, lastChunk, warnings);
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

export type DeepSeekModelRef = ProviderModelRef<typeof PROVIDER_ID, ModelId>;
export type DeepSeekProvider = ProviderSelector<typeof PROVIDER_ID, ModelId>;

export function createDeepSeek(
  settings: ProviderSettings = {},
): DeepSeekProvider {
  const getModel = (modelId: string, options?: ModelOptions): KortyxModel => {
    if (modelId.trim().length === 0) {
      throw new Error("DeepSeek model id must be a non-empty string.");
    }

    return createDeepSeekModel(modelId, settings, options);
  };

  const provider = Object.assign(
    ((modelId: ModelId, options?: ModelOptions) => {
      if (modelId.trim().length === 0) {
        throw new Error("DeepSeek model id must be a non-empty string.");
      }

      return {
        provider,
        modelId,
        ...(options ? { options } : {}),
      } satisfies DeepSeekModelRef;
    }) as unknown as DeepSeekProvider,
    {
      id: PROVIDER_ID,
      models: MODELS,
      getModel,
    },
  );

  return provider;
}

export const deepseek = createDeepSeek();
