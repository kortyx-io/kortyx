export class ProviderConfigurationError extends Error {
  override name = "ProviderConfigurationError";
}

export class ProviderRequestError extends Error {
  override name = "ProviderRequestError";
}

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

export const toProviderRequestError = (
  action: string,
  error: unknown,
): ProviderRequestError => {
  const message = error instanceof Error ? error.message : String(error);
  return new ProviderRequestError(
    `Anthropic provider failed to ${action}: ${message}`,
  );
};
