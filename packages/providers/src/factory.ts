import type {
  GetProviderFn,
  KortyxModel,
  ModelOptions,
  ProviderConfig,
  ProviderRegistry,
} from "./types";

const createGetProvider =
  (providers: Record<string, ProviderConfig>): GetProviderFn =>
  (
    providerId: string,
    modelId: string,
    options?: ModelOptions,
  ): KortyxModel => {
    const provider = providers[providerId];
    if (!provider) {
      throw new Error(
        `Provider '${providerId}' is not registered. Install and register a provider package first.`,
      );
    }

    const modelFactory = provider.models[modelId];
    if (!modelFactory) {
      const availableModels = Object.keys(provider.models).join(", ");
      throw new Error(
        `Unknown model: ${modelId} for provider ${providerId}. Available models: ${availableModels}`,
      );
    }

    const model = modelFactory();
    if (options?.temperature !== undefined)
      model.temperature = options.temperature;
    if (options?.streaming !== undefined) model.streaming = options.streaming;
    return model;
  };

export function createProviderRegistry(
  initialProviders?: ProviderConfig[],
): ProviderRegistry {
  const providers: Record<string, ProviderConfig> = {};
  for (const provider of initialProviders ?? []) {
    providers[provider.id] = provider;
  }

  return {
    register(config: ProviderConfig) {
      providers[config.id] = config;
    },
    reset() {
      for (const key of Object.keys(providers)) delete providers[key];
    },
    hasProvider(providerId: string) {
      return providerId in providers;
    },
    getInitializedProviders() {
      return Object.keys(providers);
    },
    getAvailableModels(providerId: string) {
      const provider = providers[providerId];
      return provider ? Object.keys(provider.models) : [];
    },
    getProvider: createGetProvider(providers),
  };
}

const defaultRegistry = createProviderRegistry();

export function registerProvider(config: ProviderConfig): void {
  defaultRegistry.register(config);
}

export function resetProviders(): void {
  defaultRegistry.reset();
}

export function hasProvider(providerId: string): boolean {
  return defaultRegistry.hasProvider(providerId);
}

export function getInitializedProviders(): string[] {
  return defaultRegistry.getInitializedProviders();
}

export function getAvailableModels(providerId: string): string[] {
  return defaultRegistry.getAvailableModels(providerId);
}

export const getProvider: GetProviderFn = (...args) =>
  defaultRegistry.getProvider(...args);
