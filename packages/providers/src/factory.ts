import type {
  GetProviderFn,
  ProviderInstance,
  ProviderRegistry,
} from "./types";

const createGetProvider =
  (providers: Record<string, ProviderInstance>): GetProviderFn =>
  (providerId: string): ProviderInstance => {
    const provider = providers[providerId];
    if (!provider) {
      throw new Error(`Provider '${providerId}' is not registered.`);
    }
    return provider;
  };

export function createProviderRegistry(
  initialProviders?: ProviderInstance[],
): ProviderRegistry {
  const providers: Record<string, ProviderInstance> = {};
  for (const provider of initialProviders ?? []) {
    providers[provider.id] = provider;
  }

  return {
    register(provider: ProviderInstance) {
      providers[provider.id] = provider;
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
      return provider ? [...provider.models] : [];
    },
    getProvider: createGetProvider(providers),
  };
}

const defaultRegistry = createProviderRegistry();

export function registerProvider(provider: ProviderInstance): void {
  defaultRegistry.register(provider);
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
