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
import { createGoogleClient } from "./client";
import {
  ProviderConfigurationError,
  requireApiKey,
  toProviderRequestError,
} from "./errors";
import { createGenerateContentRequest, extractText } from "./messages";
import { MODELS, type ModelId, PROVIDER_ID } from "./models";
import type { GoogleGenerateContentResponse, ProviderSettings } from "./types";

const loadGoogleApiKey = (apiKey: string | undefined): string => {
  if (apiKey !== undefined) {
    return requireApiKey(apiKey);
  }

  const envApiKey =
    process.env.GOOGLE_API_KEY ??
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.KORTYX_GOOGLE_API_KEY ??
    process.env.KORTYX_GEMINI_API_KEY;

  if (!envApiKey || envApiKey.trim().length === 0) {
    throw new ProviderConfigurationError(
      "Google provider requires an API key. Pass apiKey to createGoogleGenerativeAI(...) or set GOOGLE_API_KEY, GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, KORTYX_GOOGLE_API_KEY, or KORTYX_GEMINI_API_KEY.",
    );
  }

  return envApiKey;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const mapGoogleFinishReason = (
  finishReason: string | undefined,
): KortyxFinishReason | undefined => {
  if (finishReason === undefined) return undefined;

  switch (finishReason) {
    case "STOP":
      return { unified: "stop", raw: finishReason };
    case "MAX_TOKENS":
      return { unified: "length", raw: finishReason };
    case "IMAGE_SAFETY":
    case "RECITATION":
    case "SAFETY":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return { unified: "content-filter", raw: finishReason };
    case "MALFORMED_FUNCTION_CALL":
      return { unified: "error", raw: finishReason };
    case "FINISH_REASON_UNSPECIFIED":
    case "OTHER":
    default:
      return { unified: "other", raw: finishReason };
  }
};

const extractUsage = (
  response: GoogleGenerateContentResponse,
): KortyxUsage | undefined => {
  const usage = response.usageMetadata;
  if (!usage) return undefined;

  return {
    ...(usage.promptTokenCount != null
      ? { input: usage.promptTokenCount }
      : {}),
    ...(usage.candidatesTokenCount != null
      ? { output: usage.candidatesTokenCount }
      : {}),
    ...(usage.totalTokenCount != null ? { total: usage.totalTokenCount } : {}),
    ...(usage.thoughtsTokenCount != null
      ? { reasoning: usage.thoughtsTokenCount }
      : {}),
    ...(usage.cachedContentTokenCount != null
      ? { cacheRead: usage.cachedContentTokenCount }
      : {}),
    ...(isRecord(usage) ? { raw: usage } : {}),
  };
};

const extractProviderMetadata = (
  modelId: ModelId,
  response: GoogleGenerateContentResponse,
): KortyxProviderMetadata | undefined => {
  const promptFeedback = toRecord(response.promptFeedback);
  const usageMetadata = toRecord(response.usageMetadata);

  const metadata: KortyxProviderMetadata = {
    providerId: PROVIDER_ID,
    modelId,
    ...(response.responseId !== undefined
      ? { responseId: response.responseId }
      : {}),
    ...(response.modelVersion !== undefined
      ? { modelVersion: response.modelVersion }
      : {}),
    ...(promptFeedback !== undefined ? { promptFeedback } : {}),
    ...(usageMetadata !== undefined ? { usageMetadata } : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const extractFinishReason = (
  response: GoogleGenerateContentResponse,
): KortyxFinishReason | undefined =>
  mapGoogleFinishReason(response.candidates?.[0]?.finishReason);

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
        "Google provider currently applies JSON mode via responseMimeType but does not yet translate generic JSON schema to Google responseSchema.",
    });
  }

  if (
    options.providerOptions &&
    Object.keys(options.providerOptions).length > 0
  ) {
    warnings.push({
      type: "unsupported",
      feature: "providerOptions",
      details:
        "Google provider does not yet map providerOptions into request fields.",
    });
  }

  if (
    options.reasoning?.effort !== undefined &&
    !["minimal", "low", "medium", "high"].includes(options.reasoning.effort)
  ) {
    warnings.push({
      type: "compatibility",
      feature: "reasoning.effort",
      details:
        "Google provider supports minimal, low, medium, or high reasoning effort and falls back to medium for other values.",
    });
  }

  if (
    options.reasoning?.maxTokens !== undefined &&
    options.reasoning?.effort !== undefined
  ) {
    warnings.push({
      type: "compatibility",
      feature: "reasoning",
      details:
        "Google provider supports either reasoning.maxTokens or reasoning.effort in the same request. Kortyx prioritizes maxTokens and omits effort.",
    });
  }

  return warnings.length > 0 ? warnings : undefined;
};

const mergeWarnings = (
  left: KortyxWarning[] | undefined,
  right: KortyxWarning[] | undefined,
): KortyxWarning[] | undefined => {
  if (!left?.length) return right;
  if (!right?.length) return left;

  const seen = new Set<string>();
  const merged: KortyxWarning[] = [];
  for (const warning of [...left, ...right]) {
    const key = JSON.stringify(warning);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(warning);
  }

  return merged;
};

const supportsThinkingLevelRetry = (options: ModelOptions): boolean =>
  options.reasoning?.effort !== undefined &&
  options.reasoning?.maxTokens === undefined;

const isThinkingLevelUnsupportedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Thinking level is not supported for this model.");
};

const createThinkingLevelFallbackOptions = (
  options: ModelOptions,
): ModelOptions => ({
  ...options,
  ...(options.reasoning
    ? {
        reasoning: {
          ...(options.reasoning.maxTokens !== undefined
            ? { maxTokens: options.reasoning.maxTokens }
            : {}),
          ...(options.reasoning.includeThoughts !== undefined
            ? { includeThoughts: options.reasoning.includeThoughts }
            : {}),
        },
      }
    : {}),
});

const createThinkingLevelFallbackWarning = (): KortyxWarning => ({
  type: "compatibility",
  feature: "reasoning.effort",
  details:
    "Google rejected reasoning.effort for this model or request. Kortyx retried without it. Try other reasoning settings such as reasoning.maxTokens.",
});

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
  response: GoogleGenerateContentResponse,
  warnings: KortyxWarning[] | undefined,
): KortyxStreamPart => {
  const finishReason = extractFinishReason(response);
  const usage = extractUsage(response);
  const providerMetadata = extractProviderMetadata(modelId, response);

  return {
    type: "finish",
    raw: response,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
    ...(warnings ? { warnings } : {}),
  };
};

const createGoogleModel = (
  modelId: ModelId,
  settings: ProviderSettings,
  options: ModelOptions = {},
): KortyxModel => {
  let client: ReturnType<typeof createGoogleClient> | undefined;

  const getClient = () => {
    if (!client) {
      client = createGoogleClient({
        apiKey: loadGoogleApiKey(settings.apiKey),
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
      const request = createGenerateContentRequest(messages, resolvedOptions);

      try {
        if (resolvedOptions.streaming !== false) {
          let emitted = "";
          let lastChunk: GoogleGenerateContentResponse | undefined;
          for await (const chunk of client.streamGenerateContent(
            modelId,
            request,
            resolvedOptions.abortSignal
              ? {
                  signal: resolvedOptions.abortSignal,
                }
              : undefined,
          )) {
            lastChunk = chunk;
            const text = extractText(chunk);
            if (!text) continue;

            if (text.startsWith(emitted)) {
              const delta = text.slice(emitted.length);
              emitted = text;
              if (delta) yield createTextDeltaPart(delta, chunk);
              continue;
            }

            if (emitted.endsWith(text)) continue;

            emitted += text;
            yield createTextDeltaPart(text, chunk);
          }

          if (lastChunk) {
            yield createFinishPart(modelId, lastChunk, warnings);
          }
          return;
        }

        const response = await client.generateContent(modelId, request, {
          ...(resolvedOptions.abortSignal
            ? { signal: resolvedOptions.abortSignal }
            : {}),
        });
        const text = extractText(response);
        if (text) yield createTextDeltaPart(text, response);
        yield createFinishPart(modelId, response, warnings);
      } catch (error) {
        if (
          supportsThinkingLevelRetry(resolvedOptions) &&
          isThinkingLevelUnsupportedError(error)
        ) {
          const fallbackOptions =
            createThinkingLevelFallbackOptions(resolvedOptions);
          const fallbackRequest = createGenerateContentRequest(
            messages,
            fallbackOptions,
          );
          const fallbackWarnings = mergeWarnings(
            collectWarnings(fallbackOptions),
            [...(warnings ?? []), createThinkingLevelFallbackWarning()],
          );

          try {
            if (fallbackOptions.streaming !== false) {
              let emitted = "";
              let lastChunk: GoogleGenerateContentResponse | undefined;
              for await (const chunk of client.streamGenerateContent(
                modelId,
                fallbackRequest,
                fallbackOptions.abortSignal
                  ? {
                      signal: fallbackOptions.abortSignal,
                    }
                  : undefined,
              )) {
                lastChunk = chunk;
                const text = extractText(chunk);
                if (!text) continue;

                if (text.startsWith(emitted)) {
                  const delta = text.slice(emitted.length);
                  emitted = text;
                  if (delta) yield createTextDeltaPart(delta, chunk);
                  continue;
                }

                if (emitted.endsWith(text)) continue;

                emitted += text;
                yield createTextDeltaPart(text, chunk);
              }

              if (lastChunk) {
                yield createFinishPart(modelId, lastChunk, fallbackWarnings);
              }
              return;
            }

            const response = await client.generateContent(
              modelId,
              fallbackRequest,
              {
                ...(fallbackOptions.abortSignal
                  ? { signal: fallbackOptions.abortSignal }
                  : {}),
              },
            );
            const text = extractText(response);
            if (text) yield createTextDeltaPart(text, response);
            yield createFinishPart(modelId, response, fallbackWarnings);
            return;
          } catch (fallbackError) {
            yield {
              type: "error",
              error: toProviderRequestError("stream content", fallbackError),
            } satisfies KortyxStreamPart;
            return;
          }
        }

        yield {
          type: "error",
          error: toProviderRequestError("stream content", error),
        } satisfies KortyxStreamPart;
      }
    },

    async invoke(messages: KortyxPromptMessage[]): Promise<KortyxInvokeResult> {
      try {
        const client = getClient();
        const request = createGenerateContentRequest(messages, resolvedOptions);
        const result = await client.generateContent(modelId, request, {
          ...(resolvedOptions.abortSignal
            ? { signal: resolvedOptions.abortSignal }
            : {}),
        });
        const usage = extractUsage(result);
        const finishReason = extractFinishReason(result);
        const providerMetadata = extractProviderMetadata(modelId, result);
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
        if (
          supportsThinkingLevelRetry(resolvedOptions) &&
          isThinkingLevelUnsupportedError(error)
        ) {
          try {
            const client = getClient();
            const fallbackOptions =
              createThinkingLevelFallbackOptions(resolvedOptions);
            const fallbackRequest = createGenerateContentRequest(
              messages,
              fallbackOptions,
            );
            const result = await client.generateContent(
              modelId,
              fallbackRequest,
              {
                ...(fallbackOptions.abortSignal
                  ? { signal: fallbackOptions.abortSignal }
                  : {}),
              },
            );
            const usage = extractUsage(result);
            const finishReason = extractFinishReason(result);
            const providerMetadata = extractProviderMetadata(modelId, result);
            const fallbackWarnings = mergeWarnings(
              collectWarnings(fallbackOptions),
              [...(warnings ?? []), createThinkingLevelFallbackWarning()],
            );

            return {
              role: "assistant",
              content: extractText(result),
              raw: result,
              ...(usage ? { usage } : {}),
              ...(finishReason ? { finishReason } : {}),
              ...(providerMetadata ? { providerMetadata } : {}),
              ...(fallbackWarnings ? { warnings: fallbackWarnings } : {}),
            };
          } catch (fallbackError) {
            throw toProviderRequestError("invoke content", fallbackError);
          }
        }

        throw toProviderRequestError("invoke content", error);
      }
    },
  };
};

export type GoogleModelRef = ProviderModelRef<typeof PROVIDER_ID, ModelId>;
export type GoogleGenerativeAIProvider = ProviderSelector<
  typeof PROVIDER_ID,
  ModelId
>;

export function createGoogleGenerativeAI(
  settings: ProviderSettings = {},
): GoogleGenerativeAIProvider {
  const getModel = (modelId: string, options?: ModelOptions): KortyxModel => {
    if (!MODELS.includes(modelId as ModelId)) {
      throw new Error(
        `Unknown Google model: ${modelId}. Available models: ${MODELS.join(", ")}`,
      );
    }

    return createGoogleModel(modelId as ModelId, settings, options);
  };

  const provider = Object.assign(
    ((modelId: ModelId, options?: ModelOptions) => {
      if (!MODELS.includes(modelId)) {
        throw new Error(
          `Unknown Google model: ${modelId}. Available models: ${MODELS.join(", ")}`,
        );
      }

      return {
        provider,
        modelId,
        ...(options ? { options } : {}),
      } satisfies GoogleModelRef;
    }) as unknown as GoogleGenerativeAIProvider,
    {
      id: PROVIDER_ID,
      models: MODELS,
      getModel,
    },
  );

  return provider;
}

export const google = createGoogleGenerativeAI();
