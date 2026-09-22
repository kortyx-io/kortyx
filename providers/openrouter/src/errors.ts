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
      "OpenRouter provider requires an API key. Pass apiKey to createOpenRouter(...) or set OPENROUTER_API_KEY or KORTYX_OPENROUTER_API_KEY.",
    );
  }
  return apiKey;
};

export const toProviderRequestError = (action: string, error: unknown): Error =>
  normalizeProviderError("openrouter", action, error);
