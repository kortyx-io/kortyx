import type {
  KortyxInvokeResult,
  KortyxModel,
  KortyxPromptMessage,
  KortyxStreamChunk,
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
import type { ProviderSettings } from "./types";

const createStreamChunk = (text: string, raw: unknown): KortyxStreamChunk => ({
  text,
  raw,
});

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

const createGoogleModel = (
  modelId: ModelId,
  settings: ProviderSettings,
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

  let modelTemperature = 0.7;
  let streamResponses = true;

  return {
    async *stream(messages: KortyxPromptMessage[]) {
      try {
        const client = getClient();
        const request = createGenerateContentRequest(
          messages,
          modelTemperature,
        );

        if (streamResponses) {
          let emitted = "";
          for await (const chunk of client.streamGenerateContent(
            modelId,
            request,
          )) {
            const text = extractText(chunk);
            if (!text) continue;

            if (text.startsWith(emitted)) {
              const delta = text.slice(emitted.length);
              emitted = text;
              if (delta) yield createStreamChunk(delta, chunk);
              continue;
            }

            if (emitted.endsWith(text)) continue;

            emitted += text;
            yield createStreamChunk(text, chunk);
          }
          return;
        }

        const response = await client.generateContent(modelId, request);
        const text = extractText(response);
        if (text) yield createStreamChunk(text, response);
      } catch (error) {
        throw toProviderRequestError("stream content", error);
      }
    },

    async invoke(messages: KortyxPromptMessage[]): Promise<KortyxInvokeResult> {
      try {
        const client = getClient();
        const request = createGenerateContentRequest(
          messages,
          modelTemperature,
        );
        const result = await client.generateContent(modelId, request);
        return {
          role: "assistant",
          content: extractText(result),
          raw: result,
        };
      } catch (error) {
        throw toProviderRequestError("invoke content", error);
      }
    },

    get temperature() {
      return modelTemperature;
    },
    set temperature(value: number) {
      modelTemperature = value;
    },
    get streaming() {
      return streamResponses;
    },
    set streaming(value: boolean) {
      streamResponses = value;
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

    const model = createGoogleModel(modelId as ModelId, settings);
    if (options?.temperature !== undefined) {
      model.temperature = options.temperature;
    }
    if (options?.streaming !== undefined) {
      model.streaming = options.streaming;
    }
    return model;
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
