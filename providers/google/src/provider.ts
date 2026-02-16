import type {
  KortyxInvokeResult,
  KortyxModel,
  KortyxPromptMessage,
  KortyxStreamChunk,
  ModelOptions,
  ProviderConfig,
  ProviderModelRef,
  ProviderSelector,
} from "@kortyx/providers";
import { registerProvider } from "@kortyx/providers";
import { createGoogleClient } from "./client";
import { requireApiKey, toProviderRequestError } from "./errors";
import { createGenerateContentRequest, extractText } from "./messages";
import { MODELS, type ModelId, PROVIDER_ID } from "./models";
import type { ProviderSettings } from "./types";

const createStreamChunk = (text: string, raw: unknown): KortyxStreamChunk => ({
  text,
  raw,
});

const createProviderConfig = (settings: ProviderSettings): ProviderConfig => {
  const apiKey = requireApiKey(settings.apiKey);
  const client = createGoogleClient({
    apiKey,
    baseUrl: settings.baseUrl,
    fetch: settings.fetch,
  });

  const createModel = (modelId: ModelId): KortyxModel => {
    let modelTemperature = 0.7;
    let streamResponses = true;

    return {
      async *stream(messages: KortyxPromptMessage[]) {
        try {
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

      async invoke(
        messages: KortyxPromptMessage[],
      ): Promise<KortyxInvokeResult> {
        try {
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

  const models = Object.fromEntries(
    MODELS.map((modelId) => [modelId, () => createModel(modelId)]),
  ) as ProviderConfig["models"];

  return {
    id: PROVIDER_ID,
    models,
  };
};

export type GoogleModelRef = ProviderModelRef<typeof PROVIDER_ID, ModelId>;
export type GoogleGenerativeAIProvider = ProviderSelector<
  typeof PROVIDER_ID,
  ModelId
>;

export function createGoogleGenerativeAI(
  settings: ProviderSettings,
): GoogleGenerativeAIProvider {
  const providerConfig = createProviderConfig(settings);
  registerProvider(providerConfig);

  const provider = ((modelId: ModelId, options?: ModelOptions) => {
    if (!MODELS.includes(modelId)) {
      throw new Error(
        `Unknown Google model: ${modelId}. Available models: ${MODELS.join(", ")}`,
      );
    }

    return {
      providerId: PROVIDER_ID,
      modelId,
      ...(options ? { options } : {}),
    } satisfies GoogleModelRef;
  }) as GoogleGenerativeAIProvider;

  provider.id = PROVIDER_ID;
  provider.models = MODELS;
  return provider;
}
