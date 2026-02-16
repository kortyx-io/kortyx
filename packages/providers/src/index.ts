// release-test: 2026-01-22
/**
 * @kortyx/providers
 *
 * Provider-agnostic registry + contracts for Kortyx model providers.
 * Concrete providers live in separate packages (e.g. @kortyx/google).
 */

// Registry
export {
  createProviderRegistry,
  getAvailableModels,
  getInitializedProviders,
  getProvider,
  hasProvider,
  registerProvider,
  resetProviders,
} from "./factory";
// Types
export type {
  GetProviderFn,
  KortyxInvokeResult,
  KortyxModel,
  KortyxPromptMessage,
  KortyxPromptRole,
  KortyxStreamChunk,
  ModelFactory,
  ModelOptions,
  ProviderConfig,
  ProviderModelRef,
  ProviderRegistry,
  ProviderSelector,
} from "./types";
