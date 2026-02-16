import type { KortyxModel, ProviderConfig } from "@kortyx/providers";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export const GOOGLE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
] as const;

export type GoogleModelId = (typeof GOOGLE_MODELS)[number];

export function createGoogleProvider(apiKey: string): ProviderConfig {
  const createModel = (modelId: string): KortyxModel => {
    const model = new ChatGoogleGenerativeAI({
      model: modelId,
      apiKey,
      streaming: true,
    });

    return {
      stream: (messages) => model.stream(messages),
      invoke: (messages) => model.invoke(messages),
      get temperature() {
        return model.temperature ?? 0.7;
      },
      set temperature(value: number) {
        model.temperature = value;
      },
      get streaming() {
        return model.streaming ?? true;
      },
      set streaming(value: boolean) {
        model.streaming = value;
      },
    };
  };

  return {
    id: "google",
    models: {
      "gemini-2.5-flash": () => createModel("gemini-2.5-flash"),
      "gemini-2.0-flash": () => createModel("gemini-2.0-flash"),
      "gemini-1.5-pro": () => createModel("gemini-1.5-pro"),
      "gemini-1.5-flash": () => createModel("gemini-1.5-flash"),
    },
  };
}
