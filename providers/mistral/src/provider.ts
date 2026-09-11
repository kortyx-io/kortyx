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
import { createMistralClient } from "./client";
import {
  ProviderConfigurationError,
  requireApiKey,
  toProviderRequestError,
} from "./errors";
import {
  createChatCompletionRequest,
  modelSupportsReasoningEffort,
} from "./messages";
import { MODELS, type ModelId, PROVIDER_ID } from "./models";
import type {
  MistralChatCompletionResponse,
  MistralContent,
  MistralUsage,
  ProviderSettings,
} from "./types";

const loadMistralApiKey = (apiKey: string | undefined): string => {
  if (apiKey !== undefined) {
    return requireApiKey(apiKey);
  }

  const envApiKey =
    process.env.MISTRAL_API_KEY ?? process.env.KORTYX_MISTRAL_API_KEY;

  if (!envApiKey || envApiKey.trim().length === 0) {
    throw new ProviderConfigurationError(
      "Mistral provider requires an API key. Pass apiKey to createMistral(...) or set MISTRAL_API_KEY or KORTYX_MISTRAL_API_KEY.",
    );
  }

  return envApiKey;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const mapMistralFinishReason = (
  finishReason: string | null | undefined,
): KortyxFinishReason | undefined => {
  if (finishReason == null) return undefined;

  switch (finishReason) {
    case "stop":
      return { unified: "stop", raw: finishReason };
    case "length":
    case "model_length":
      return { unified: "length", raw: finishReason };
    case "tool_calls":
      return { unified: "tool-calls", raw: finishReason };
    default:
      return { unified: "other", raw: finishReason };
  }
};

const extractUsage = (
  usage: MistralUsage | null | undefined,
): KortyxUsage | undefined => {
  if (usage == null) return undefined;

  return {
    ...(usage.prompt_tokens != null ? { input: usage.prompt_tokens } : {}),
    ...(usage.completion_tokens != null
      ? { output: usage.completion_tokens }
      : {}),
    ...(usage.total_tokens != null ? { total: usage.total_tokens } : {}),
    ...(isRecord(usage) ? { raw: usage } : {}),
  };
};

const extractTextFromContent = (content: MistralContent): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content) {
    if (!isRecord(part)) continue;
    if (part.type === "text" && typeof part.text === "string") {
      parts.push(part.text);
    }
  }

  return parts.join("");
};

const extractText = (response: MistralChatCompletionResponse): string =>
  extractTextFromContent(response.choices?.[0]?.message?.content);

const parseToolInput = (value: string | undefined): unknown => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid JSON in provider function arguments.");
  }
};

const extractToolCalls = (
  response: MistralChatCompletionResponse,
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
  response: MistralChatCompletionResponse,
): KortyxFinishReason | undefined =>
  mapMistralFinishReason(response.choices?.[0]?.finish_reason);

const extractResponseProviderMetadata = (
  modelId: ModelId,
  response: MistralChatCompletionResponse,
): KortyxProviderMetadata | undefined => {
  const usage = toRecord(response.usage);
  const metadata: KortyxProviderMetadata = {
    providerId: PROVIDER_ID,
    modelId,
    ...(response.id !== undefined && response.id !== null
      ? { responseId: response.id }
      : {}),
    ...(response.model !== undefined && response.model !== null
      ? { responseModel: response.model }
      : {}),
    ...(response.created !== undefined && response.created !== null
      ? { created: response.created }
      : {}),
    ...(usage !== undefined ? { usage } : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const getProviderOptions = (
  options: ModelOptions,
): Record<string, unknown> | undefined => {
  const providerOptions = options.providerOptions;
  if (!providerOptions) return undefined;
  const nested = providerOptions.mistral;
  if (isRecord(nested)) return nested;
  return providerOptions;
};

const collectWarnings = (
  modelId: ModelId,
  options: ModelOptions,
): KortyxWarning[] | undefined => {
  const warnings: KortyxWarning[] = [];
  if (
    modelSupportsReasoningEffort(modelId) &&
    options.reasoning?.effort &&
    ["minimal", "low", "medium"].includes(options.reasoning.effort)
  )
    warnings.push({
      type: "compatibility",
      feature: "reasoning.effort",
      details:
        "Mistral exposes none/high reasoning. Positive generic effort levels map to high.",
    });

  if (options.stopSequences !== undefined) {
    warnings.push({
      type: "unsupported",
      feature: "stopSequences",
      details:
        "Mistral chat completions do not support stop sequences in the AI SDK reference implementation. Kortyx does not send them.",
    });
  }

  if (
    options.reasoning !== undefined &&
    !modelSupportsReasoningEffort(modelId)
  ) {
    warnings.push({
      type: "unsupported",
      feature: "reasoning",
      details:
        "This Mistral model does not expose configurable reasoning effort.",
    });
  }

  const providerOptions = options.providerOptions;
  const allowedProviderOptions = new Set([
    "mistral",
    "safePrompt",
    "structuredOutputs",
    "strictJsonSchema",
    "reasoningEffort",
    "topP",
    "randomSeed",
  ]);
  if (
    providerOptions &&
    Object.keys(providerOptions).some((key) => !allowedProviderOptions.has(key))
  ) {
    warnings.push({
      type: "unsupported",
      feature: "providerOptions",
      details:
        "Mistral provider currently maps safePrompt, structuredOutputs, strictJsonSchema, reasoningEffort, topP, and randomSeed.",
    });
  }

  const nestedProviderOptions = getProviderOptions(options);
  if (
    providerOptions?.mistral !== undefined &&
    nestedProviderOptions &&
    Object.keys(nestedProviderOptions).some(
      (key) => !allowedProviderOptions.has(key),
    )
  ) {
    warnings.push({
      type: "unsupported",
      feature: "providerOptions.mistral",
      details:
        "Mistral provider currently maps safePrompt, structuredOutputs, strictJsonSchema, reasoningEffort, topP, and randomSeed.",
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

const continuation = (response: MistralChatCompletionResponse) => {
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
  response: MistralChatCompletionResponse,
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

const createMistralModel = (
  modelId: ModelId,
  settings: ProviderSettings,
  options: ModelOptions = {},
): KortyxModel => {
  let client: ReturnType<typeof createMistralClient> | undefined;

  const getClient = () => {
    if (!client) {
      client = createMistralClient({
        apiKey: loadMistralApiKey(settings.apiKey),
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

      let partialUsage: MistralUsage | undefined;
      try {
        if (resolvedOptions.streaming !== false) {
          const accumulator = new ChatStreamAccumulator();
          for await (const chunk of client.streamChatCompletion(request, {
            ...(resolvedOptions.abortSignal
              ? { signal: resolvedOptions.abortSignal }
              : {}),
          })) {
            partialUsage = chunk.usage ?? partialUsage;
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
            const delta = extractTextFromContent(
              chunk.choices?.[0]?.delta?.content,
            );
            if (delta) yield createTextDeltaPart(delta, chunk);
          }
          yield createResponseFinishPart(
            modelId,
            accumulator.finish() as MistralChatCompletionResponse,
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

export type MistralModelRef = ProviderModelRef<typeof PROVIDER_ID, ModelId>;
export type MistralProvider = ProviderSelector<typeof PROVIDER_ID, ModelId>;

export function createMistral(
  settings: ProviderSettings = {},
): MistralProvider {
  const getModel = (modelId: string, options?: ModelOptions): KortyxModel => {
    if (modelId.trim().length === 0) {
      throw new Error("Mistral model id must be a non-empty string.");
    }

    return createMistralModel(modelId, settings, options);
  };

  const provider = Object.assign(
    ((modelId: ModelId, options?: ModelOptions) => {
      if (modelId.trim().length === 0) {
        throw new Error("Mistral model id must be a non-empty string.");
      }

      return {
        provider,
        modelId,
        ...(options ? { options } : {}),
      } satisfies MistralModelRef;
    }) as unknown as MistralProvider,
    {
      id: PROVIDER_ID,
      models: MODELS,
      getModel,
    },
  );

  return provider;
}

export const mistral = createMistral();
