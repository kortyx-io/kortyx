import { randomUUID } from "node:crypto";
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
    inputIncludesCacheRead: true,
    outputIncludesReasoning: false,
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
): KortyxFinishReason | undefined => {
  const candidate = response.candidates?.[0];
  if (
    candidate?.finishReason === "STOP" &&
    candidate.content?.parts?.some((part) => part.functionCall)
  )
    return { unified: "tool-calls", raw: "STOP" };
  return mapGoogleFinishReason(candidate?.finishReason);
};

const extractToolCalls = (
  response: GoogleGenerateContentResponse,
): KortyxToolCall[] | undefined => {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const toolCalls = parts
    .map((part): KortyxToolCall | undefined => {
      if (!part.functionCall) return undefined;
      if (!part.functionCall.name)
        throw new Error("Google returned an incomplete function call.");
      return {
        id: part.functionCall.id ?? `google-${randomUUID()}`,
        name: part.functionCall.name,
        input: part.functionCall.args ?? {},
        raw: part.functionCall,
      };
    })
    .filter((toolCall): toolCall is KortyxToolCall => toolCall !== undefined);

  return toolCalls.length > 0 ? toolCalls : undefined;
};

const collectWarnings = (
  options: ModelOptions,
  modelId: string,
): KortyxWarning[] | undefined => {
  const warnings: KortyxWarning[] = [];
  if (
    modelId.includes("gemini-2.5") &&
    options.reasoning?.effort &&
    options.reasoning.effort !== "none"
  )
    warnings.push({
      type: "compatibility",
      feature: "reasoning.effort",
      details:
        "Gemini 2.5 uses token budgets: minimal=512, low=1024, medium=8192, high=24576. Set reasoning.maxTokens for an explicit budget.",
    });
  if (
    options.providerOptions &&
    Object.keys(options.providerOptions).some((key) => key !== "google")
  )
    warnings.push({
      type: "unsupported",
      feature: "providerOptions",
      details: "Google maps providerOptions.google.thinkingConfig.",
    });
  return warnings.length ? warnings : undefined;
};

const continuation = (response: GoogleGenerateContentResponse) => ({
  providerId: PROVIDER_ID,
  api: "generate-content",
  items: response.candidates?.[0]?.content?.parts ?? [],
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
    ...(options.tools !== undefined ? { tools: options.tools } : {}),
    ...(options.providerOptions !== undefined
      ? { providerOptions: options.providerOptions }
      : {}),
  };
  const warnings = collectWarnings(resolvedOptions, modelId);

  const normalize = (
    result: GoogleGenerateContentResponse,
  ): KortyxInvokeResult => {
    const finishReason = extractFinishReason(result);
    const usage = extractUsage(result);
    const toolCalls = extractToolCalls(result);
    const providerMetadata = extractProviderMetadata(modelId, result);
    return {
      role: "assistant",
      content: extractText(result),
      raw: result,
      continuation: continuation(result),
      ...(usage ? { usage } : {}),
      ...(finishReason
        ? {
            finishReason:
              toolCalls?.length && finishReason.unified === "stop"
                ? {
                    unified: "tool-calls",
                    ...(finishReason.raw ? { raw: finishReason.raw } : {}),
                  }
                : finishReason,
          }
        : {}),
      ...(toolCalls ? { toolCalls } : {}),
      ...(warnings ? { warnings } : {}),
      ...(providerMetadata ? { providerMetadata } : {}),
    };
  };
  return {
    supportsToolStreaming: true,
    async *stream(messages: KortyxPromptMessage[]) {
      let partialUsage: KortyxUsage | undefined;
      try {
        const client = getClient();
        const request = createGenerateContentRequest(
          messages,
          resolvedOptions,
          modelId,
        );
        if (resolvedOptions.streaming === false) {
          const result = await client.generateContent(modelId, request, {
            signal: resolvedOptions.abortSignal,
          });
          const text = extractText(result);
          if (text) yield createTextDeltaPart(text, result);
          yield createFinishPart(modelId, result, warnings);
          return;
        }
        let accumulated: GoogleGenerateContentResponse = {};
        const parts: NonNullable<
          NonNullable<
            GoogleGenerateContentResponse["candidates"]
          >[number]["content"]
        >["parts"] = [];
        let finishReason: string | undefined;
        for await (const chunk of client.streamGenerateContent(
          modelId,
          request,
          { signal: resolvedOptions.abortSignal },
        )) {
          accumulated = { ...accumulated, ...chunk };
          partialUsage = extractUsage(chunk) ?? partialUsage;
          parts.push(...(chunk.candidates?.[0]?.content?.parts ?? []));
          finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
          const text = extractText(chunk);
          if (text) yield createTextDeltaPart(text, chunk);
        }
        if (!finishReason)
          throw new Error(
            "Google stream ended without a terminal finish reason.",
          );
        accumulated.candidates = [{ content: { parts }, finishReason }];
        yield createFinishPart(modelId, accumulated, warnings);
      } catch (error) {
        yield {
          type: "error",
          error: Object.assign(
            toProviderRequestError("stream content", error),
            { usage: partialUsage },
          ),
        };
      }
    },
    async invoke(messages: KortyxPromptMessage[]) {
      try {
        return normalize(
          await getClient().generateContent(
            modelId,
            createGenerateContentRequest(messages, resolvedOptions, modelId),
            { signal: resolvedOptions.abortSignal },
          ),
        );
      } catch (error) {
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
    if (!modelId.trim())
      throw new Error("Google model id must be a non-empty string.");

    return createGoogleModel(modelId as ModelId, settings, options);
  };

  const provider = Object.assign(
    ((modelId: ModelId, options?: ModelOptions) => {
      if (!modelId.trim())
        throw new Error("Google model id must be a non-empty string.");

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
