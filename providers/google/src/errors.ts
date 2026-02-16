export class ProviderConfigurationError extends Error {
  override name = "ProviderConfigurationError";
}

export class ProviderRequestError extends Error {
  override name = "ProviderRequestError";
}

export const requireApiKey = (apiKey: string | undefined): string => {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new ProviderConfigurationError(
      "Google provider requires an API key.",
    );
  }
  return apiKey;
};

export const toProviderRequestError = (
  action: string,
  error: unknown,
): ProviderRequestError => {
  const message = error instanceof Error ? error.message : String(error);
  return new ProviderRequestError(
    `Google provider failed to ${action}: ${message}`,
  );
};
