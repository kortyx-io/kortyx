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
import type {
  ChatAssistantMessage,
  ChatResult,
  ChatStreamChunk,
  ChatUsage,
} from "@openrouter/sdk/models";
import { createOpenRouterClient } from "./client.js";
import {
  ProviderConfigurationError,
  ProviderRequestError,
  requireApiKey,
  toProviderRequestError,
} from "./errors.js";
import { createJevModel, isJevModelId } from "./jev.js";
import { createChatRequest } from "./messages.js";
import { MODELS, type ModelId, PROVIDER_ID } from "./models.js";
import type { OpenRouterModelOptions, ProviderSettings } from "./types.js";

const loadApiKey = (apiKey: string | undefined): string =>
  requireApiKey(
    apiKey ??
      process.env.OPENROUTER_API_KEY ??
      process.env.KORTYX_OPENROUTER_API_KEY,
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isAsyncIterable = (
  value: unknown,
): value is AsyncIterable<ChatStreamChunk> =>
  isRecord(value) && Symbol.asyncIterator in value;

const mapFinishReason = (
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
    case "error":
      return { unified: "error", raw: finishReason };
    default:
      return { unified: "other", raw: finishReason };
  }
};

const mapUsage = (usage: ChatUsage | undefined): KortyxUsage | undefined =>
  usage
    ? {
        input: usage.promptTokens,
        output: usage.completionTokens,
        total: usage.totalTokens,
        outputIncludesReasoning: true,
        inputIncludesCacheRead: true,
        inputIncludesCacheWrite: true,
        ...(usage.completionTokensDetails?.reasoningTokens != null
          ? { reasoning: usage.completionTokensDetails.reasoningTokens }
          : {}),
        ...(usage.promptTokensDetails?.cachedTokens != null
          ? { cacheRead: usage.promptTokensDetails.cachedTokens }
          : {}),
        ...(usage.promptTokensDetails?.cacheWriteTokens != null
          ? { cacheWrite: usage.promptTokensDetails.cacheWriteTokens }
          : {}),
        raw: usage as unknown as Record<string, unknown>,
      }
    : undefined;

const contentText = (content: ChatAssistantMessage["content"]): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("");
};

const parseInput = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const mapToolCalls = (
  calls: ChatAssistantMessage["toolCalls"],
): KortyxToolCall[] | undefined =>
  calls?.length
    ? calls.map((call) => ({
        id: call.id,
        name: call.function.name,
        input: parseInput(call.function.arguments),
        raw: call,
      }))
    : undefined;

const metadata = (
  modelId: string,
  response: Pick<
    ChatResult | ChatStreamChunk,
    "id" | "model" | "serviceTier" | "openrouterMetadata" | "usage"
  >,
): KortyxProviderMetadata => ({
  providerId: PROVIDER_ID,
  api: "chat-completions",
  modelId,
  responseId: response.id,
  responseModel: response.model,
  serviceTier: response.serviceTier,
  cost: response.usage?.cost,
  costDetails: response.usage?.costDetails,
  isByok: response.usage?.isByok,
  openrouter: response.openrouterMetadata,
});

const warningsFor = (options: ModelOptions): KortyxWarning[] | undefined => {
  const warnings: KortyxWarning[] = [];
  if (options.reasoning?.maxTokens !== undefined) {
    warnings.push({
      type: "unsupported",
      feature: "reasoning.maxTokens",
      details:
        "OpenRouter's current Chat Completions schema exposes normalized reasoning effort but not a portable reasoning token budget.",
    });
  }
  return warnings.length ? warnings : undefined;
};

const resultFrom = (
  modelId: string,
  response: ChatResult,
  warnings: KortyxWarning[] | undefined,
): KortyxInvokeResult => {
  const choice = response.choices[0];
  if (!choice)
    throw new ProviderRequestError(
      "OpenRouter returned a chat completion without a choice.",
    );
  const toolCalls = mapToolCalls(choice.message.toolCalls);
  const usage = mapUsage(response.usage);
  const finishReason = mapFinishReason(choice.finishReason);
  const reasoningDetails = choice.message.reasoningDetails;
  return {
    role: "assistant",
    content: contentText(choice.message.content),
    raw: response,
    ...(usage ? { usage } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(toolCalls ? { toolCalls } : {}),
    ...(warnings ? { warnings } : {}),
    providerMetadata: metadata(modelId, response),
    ...(reasoningDetails?.length
      ? {
          continuation: {
            providerId: PROVIDER_ID,
            api: "chat-completions",
            items: reasoningDetails,
          },
        }
      : {}),
  };
};

const createChatModel = (
  modelId: string,
  settings: ProviderSettings,
  options: ModelOptions,
): KortyxModel => {
  let client: ReturnType<typeof createOpenRouterClient> | undefined;
  const getClient = () => {
    if (!client)
      client = createOpenRouterClient(settings, () =>
        loadApiKey(settings.apiKey),
      );
    return client;
  };
  const warnings = warningsFor(options);

  return {
    supportsToolStreaming: true,
    async invoke(messages: KortyxPromptMessage[]) {
      try {
        const response = await getClient().chat(
          createChatRequest(modelId, messages, options, false),
          options.abortSignal,
        );
        if (isAsyncIterable(response))
          throw new ProviderRequestError(
            "OpenRouter unexpectedly returned a stream for a non-streaming request.",
          );
        return resultFrom(modelId, response, warnings);
      } catch (error) {
        throw toProviderRequestError("invoke content", error);
      }
    },

    async *stream(
      messages: KortyxPromptMessage[],
    ): AsyncGenerator<KortyxStreamPart> {
      if (options.streaming === false) {
        try {
          const result = await this.invoke(messages);
          if (result.content)
            yield {
              type: "text-delta",
              delta: result.content,
              raw: result.raw,
            };
          yield { ...result, type: "finish" };
        } catch (error) {
          yield { type: "error", error };
        }
        return;
      }

      let lastChunk: ChatStreamChunk | undefined;
      let partialUsage: KortyxUsage | undefined;
      try {
        const response = await getClient().chat(
          createChatRequest(modelId, messages, options, true),
          options.abortSignal,
        );
        if (!isAsyncIterable(response))
          throw new ProviderRequestError(
            "OpenRouter unexpectedly returned a non-streaming response for a streaming request.",
          );

        const calls = new Map<
          number,
          { id: string; name: string; arguments: string; raw: unknown[] }
        >();
        const reasoningDetails: unknown[] = [];
        let finishReason: string | null | undefined;
        for await (const chunk of response) {
          lastChunk = chunk;
          partialUsage = mapUsage(chunk.usage) ?? partialUsage;
          if (chunk.error)
            throw new ProviderRequestError(chunk.error.message, {
              ...(chunk.error.metadata
                ? { details: chunk.error.metadata }
                : {}),
            });
          for (const choice of chunk.choices) {
            finishReason = choice.finishReason ?? finishReason;
            if (choice.delta.content)
              yield {
                type: "text-delta",
                delta: choice.delta.content,
                raw: chunk,
              };
            reasoningDetails.push(...(choice.delta.reasoningDetails ?? []));
            for (const [position, delta] of (
              choice.delta.toolCalls ?? []
            ).entries()) {
              const index = delta.index ?? position;
              const call = calls.get(index) ?? {
                id: "",
                name: "",
                arguments: "",
                raw: [],
              };
              call.id = delta.id ?? call.id;
              call.name += delta.function?.name ?? "";
              call.arguments += delta.function?.arguments ?? "";
              call.raw.push(delta);
              calls.set(index, call);
            }
          }
        }
        if (!lastChunk || !finishReason)
          throw new ProviderRequestError(
            "OpenRouter stream ended without a finish reason.",
          );
        const toolCalls = calls.size
          ? [...calls.entries()]
              .sort(([left], [right]) => left - right)
              .map(([, call]) => {
                if (!call.id || !call.name)
                  throw new ProviderRequestError(
                    "OpenRouter returned an incomplete streamed tool call.",
                  );
                return {
                  id: call.id,
                  name: call.name,
                  input: parseInput(call.arguments),
                  raw: call.raw,
                } satisfies KortyxToolCall;
              })
          : undefined;
        const mappedFinishReason = mapFinishReason(finishReason);
        yield {
          type: "finish",
          raw: lastChunk,
          ...(mappedFinishReason ? { finishReason: mappedFinishReason } : {}),
          ...(partialUsage ? { usage: partialUsage } : {}),
          ...(toolCalls ? { toolCalls } : {}),
          ...(warnings ? { warnings } : {}),
          providerMetadata: metadata(modelId, lastChunk),
          ...(reasoningDetails.length
            ? {
                continuation: {
                  providerId: PROVIDER_ID,
                  api: "chat-completions",
                  items: reasoningDetails,
                },
              }
            : {}),
        };
      } catch (error) {
        yield {
          type: "error",
          error: Object.assign(
            toProviderRequestError("stream content", error),
            {
              usage: partialUsage,
            },
          ),
          ...(lastChunk ? { raw: lastChunk } : {}),
        };
      }
    },
  };
};

export type OpenRouterModelRef = ProviderModelRef<typeof PROVIDER_ID, ModelId>;
export interface OpenRouterProvider
  extends ProviderInstance<typeof PROVIDER_ID, ModelId> {
  (modelId: ModelId, options?: OpenRouterModelOptions): OpenRouterModelRef;
  getModel: (modelId: string, options?: OpenRouterModelOptions) => KortyxModel;
}

export function createOpenRouter(
  settings: ProviderSettings = {},
): OpenRouterProvider {
  const getModel = (
    modelId: string,
    options?: OpenRouterModelOptions,
  ): KortyxModel => {
    if (!modelId.trim())
      throw new ProviderConfigurationError(
        "OpenRouter model id must be a non-empty string.",
      );
    return isJevModelId(modelId)
      ? createJevModel(modelId, settings, options ?? {}, () =>
          loadApiKey(settings.apiKey),
        )
      : createChatModel(modelId, settings, options ?? {});
  };
  const provider = Object.assign(
    ((modelId: ModelId, options?: OpenRouterModelOptions) => {
      if (!modelId.trim())
        throw new ProviderConfigurationError(
          "OpenRouter model id must be a non-empty string.",
        );
      return {
        provider,
        modelId,
        ...(options ? { options } : {}),
      } satisfies OpenRouterModelRef;
    }) as unknown as OpenRouterProvider,
    {
      id: PROVIDER_ID,
      models: MODELS,
      getModel,
    },
  );
  return provider;
}

export const openrouter = createOpenRouter();
