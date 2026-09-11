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
  ProviderModelRef,
  ProviderSelector,
} from "@kortyx/providers";
import { ChatStreamAccumulator } from "@kortyx/providers";
import { createGroqClient } from "./client";
import {
  ProviderConfigurationError,
  requireApiKey,
  toProviderRequestError,
} from "./errors";
import { createChatCompletionRequest, usesNativeSchema } from "./messages";
import { MODELS, type ModelId, PROVIDER_ID } from "./models";
import type {
  GroqChatCompletionResponse,
  GroqUsage,
  ProviderSettings,
} from "./types";

const loadGroqApiKey = (apiKey: string | undefined): string => {
  if (apiKey !== undefined) {
    return requireApiKey(apiKey);
  }

  const envApiKey = process.env.GROQ_API_KEY ?? process.env.KORTYX_GROQ_API_KEY;

  if (!envApiKey || envApiKey.trim().length === 0) {
    throw new ProviderConfigurationError(
      "Groq provider requires an API key. Pass apiKey to createGroq(...) or set GROQ_API_KEY or KORTYX_GROQ_API_KEY.",
    );
  }

  return envApiKey;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const mapGroqFinishReason = (
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
  usage: GroqUsage | null | undefined,
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
  response: GroqChatCompletionResponse,
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
          cachedTokens: toRecord(usage.prompt_tokens_details)?.cached_tokens,
          reasoningTokens: toRecord(usage.completion_tokens_details)
            ?.reasoning_tokens,
        }
      : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const extractText = (response: GroqChatCompletionResponse): string =>
  response.choices?.[0]?.message?.content ?? "";

const parseToolInput = (value: string | undefined): unknown => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid JSON in provider function arguments.");
  }
};

const extractToolCalls = (
  response: GroqChatCompletionResponse,
): KortyxToolCall[] | undefined => {
  const toolCalls = response.choices?.[0]?.message?.tool_calls;
  if (!toolCalls?.length) return undefined;
  return toolCalls.map((toolCall) => {
    if (!toolCall.id || !toolCall.function?.name)
      throw new Error("Incomplete provider function call.");
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      input: parseToolInput(toolCall.function.arguments),
      raw: toolCall,
    };
  });
};

const extractFinishReason = (
  response: GroqChatCompletionResponse,
): KortyxFinishReason | undefined =>
  mapGroqFinishReason(response.choices?.[0]?.finish_reason);

const collectWarnings = (
  options: ModelOptions,
): KortyxWarning[] | undefined => {
  const warnings: KortyxWarning[] = [];

  if (
    options.responseFormat?.type === "json" &&
    options.responseFormat.schema !== undefined &&
    options.providerOptions?.structuredOutputs === false
  ) {
    warnings.push({
      type: "unsupported",
      feature: "responseFormat",
      details:
        "Groq JSON schema response format is only supported when structuredOutputs is enabled.",
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
        "Groq supports none, low, medium, or high reasoning effort. Kortyx only maps compatible generic reasoning efforts.",
    });
  }

  if (options.reasoning?.maxTokens !== undefined) {
    warnings.push({
      type: "unsupported",
      feature: "reasoning.maxTokens",
      details:
        "Groq does not expose a generic reasoning token budget through the chat completions API.",
    });
  }

  const providerOptions = options.providerOptions;
  const allowedProviderOptions = new Set([
    "groq",
    "reasoningFormat",
    "reasoningEffort",
    "serviceTier",
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
        "Groq provider currently maps reasoningFormat, reasoningEffort, serviceTier, structuredOutputs, and strictJsonSchema.",
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

const continuation = (response: GroqChatCompletionResponse) => {
  const message = response.choices?.[0]?.message;
  return {
    providerId: PROVIDER_ID,
    api: "chat-completions",
    items: message
      ? [
          {
            role: "assistant",
            content: message.content ?? "",
            ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
          },
        ]
      : [],
  };
};

const createResponseFinishPart = (
  modelId: ModelId,
  response: GroqChatCompletionResponse,
  warnings: KortyxWarning[] | undefined,
): KortyxStreamPart => {
  const finishReason = extractFinishReason(response);
  const usage = extractUsage(response.usage);
  const providerMetadata = extractResponseProviderMetadata(modelId, response);
  const toolCalls = extractToolCalls(response);

  return {
    type: "finish",
    continuation: continuation(response),
    raw: response,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
    ...(toolCalls ? { toolCalls } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
    ...(warnings ? { warnings } : {}),
  };
};

const createGroqModel = (
  modelId: ModelId,
  settings: ProviderSettings,
  options: ModelOptions = {},
): KortyxModel => {
  let client: ReturnType<typeof createGroqClient> | undefined;

  const getClient = () => {
    if (!client) {
      client = createGroqClient({
        apiKey: loadGroqApiKey(settings.apiKey),
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
    ...(options.tools !== undefined ? { tools: options.tools } : {}),
    ...(options.providerOptions !== undefined
      ? { providerOptions: options.providerOptions }
      : {}),
  };
  const warnings = collectWarnings(resolvedOptions);

  return {
    supportsToolStreaming: true,
    requiresSeparateStructuredOutput: usesNativeSchema(resolvedOptions),
    async *stream(messages: KortyxPromptMessage[]) {
      const client = getClient();
      const request = createChatCompletionRequest(
        modelId,
        messages,
        resolvedOptions,
        resolvedOptions.streaming !== false,
      );

      let partialUsage: GroqUsage | undefined;
      try {
        if (request.stream) {
          const accumulator = new ChatStreamAccumulator();
          for await (const chunk of client.streamChatCompletion(request, {
            ...(resolvedOptions.abortSignal
              ? { signal: resolvedOptions.abortSignal }
              : {}),
          })) {
            partialUsage = chunk.x_groq?.usage ?? chunk.usage ?? partialUsage;
            if (chunk.error?.message) {
              yield {
                type: "error",
                error: Object.assign(new Error(chunk.error.message), {
                  usage: extractUsage(partialUsage),
                }),
                raw: chunk,
              };
              return;
            }
            accumulator.add(chunk);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield createTextDeltaPart(delta, chunk);
          }
          yield createResponseFinishPart(
            modelId,
            accumulator.finish() as GroqChatCompletionResponse,
            warnings,
          );
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
          error: Object.assign(
            toProviderRequestError("stream content", error),
            { usage: extractUsage(partialUsage) },
          ),
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
          continuation: continuation(result),
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

export type GroqModelRef = ProviderModelRef<typeof PROVIDER_ID, ModelId>;
export type GroqProvider = ProviderSelector<typeof PROVIDER_ID, ModelId>;

export function createGroq(settings: ProviderSettings = {}): GroqProvider {
  const getModel = (modelId: string, options?: ModelOptions): KortyxModel => {
    if (modelId.trim().length === 0) {
      throw new Error("Groq model id must be a non-empty string.");
    }

    return createGroqModel(modelId, settings, options);
  };

  const provider = Object.assign(
    ((modelId: ModelId, options?: ModelOptions) => {
      if (modelId.trim().length === 0) {
        throw new Error("Groq model id must be a non-empty string.");
      }

      return {
        provider,
        modelId,
        ...(options ? { options } : {}),
      } satisfies GroqModelRef;
    }) as unknown as GroqProvider,
    {
      id: PROVIDER_ID,
      models: MODELS,
      getModel,
    },
  );

  return provider;
}

export const groq = createGroq();
