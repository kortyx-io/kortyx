import { HTTPClient } from "@openrouter/sdk";
import { OpenRouterCore } from "@openrouter/sdk/core.js";
import { chatSend } from "@openrouter/sdk/funcs/chatSend.js";
import { systemOneCreate } from "@openrouter/sdk/funcs/systemOneCreate.js";
import type { ChatRequest, DecisionsRequest } from "@openrouter/sdk/models";
import type { ProviderSettings } from "./types.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export function createOpenRouterClient(
  settings: ProviderSettings,
  apiKey: () => string,
) {
  const httpClient = settings.fetch
    ? new HTTPClient({ fetcher: settings.fetch })
    : undefined;
  const client = new OpenRouterCore({
    apiKey: async () => apiKey(),
    serverURL: settings.baseUrl ?? DEFAULT_BASE_URL,
    ...(settings.httpReferer ? { httpReferer: settings.httpReferer } : {}),
    ...(settings.appTitle ? { appTitle: settings.appTitle } : {}),
    ...(settings.appCategories
      ? { appCategories: settings.appCategories }
      : {}),
    ...(httpClient ? { httpClient } : {}),
    retryConfig: { strategy: "none" },
  });

  return {
    async chat(request: ChatRequest, signal?: AbortSignal) {
      const result = await chatSend(
        client,
        {
          xOpenRouterMetadata: "enabled",
          chatRequest: request,
        },
        signal ? { signal } : undefined,
      );
      if (!result.ok) throw result.error;
      return result.value;
    },

    async decide(request: DecisionsRequest, signal?: AbortSignal) {
      const result = await systemOneCreate(
        client,
        { decisionsRequest: request },
        signal ? { signal } : undefined,
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
  };
}
