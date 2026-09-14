import {
  normalizeProviderError,
  ProviderConfigurationError,
} from "@kortyx/core/errors";

export {
  ProviderConfigurationError,
  ProviderRequestError,
} from "@kortyx/core/errors";
export const requireSecret = (
  secret: string | undefined,
  label: "API key" | "auth token",
): string => {
  if (!secret || secret.trim().length === 0) {
    throw new ProviderConfigurationError(
      `Anthropic provider requires an ${label}.`,
    );
  }
  return secret;
};

export const toProviderRequestError = (action: string, error: unknown): Error =>
  normalizeProviderError("anthropic", action, error);
