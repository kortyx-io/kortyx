import {
  normalizeProviderError,
  ProviderConfigurationError,
} from "@kortyx/core/errors";

export {
  ProviderConfigurationError,
  ProviderRequestError,
} from "@kortyx/core/errors";
export const requireApiKey = (apiKey: string | undefined): string => {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new ProviderConfigurationError(
      "OpenAI provider requires an API key.",
    );
  }
  return apiKey;
};

export const toProviderRequestError = (action: string, error: unknown): Error =>
  normalizeProviderError("openai", action, error);
