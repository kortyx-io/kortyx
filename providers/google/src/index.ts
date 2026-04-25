// release-test: 2026-01-22

export type { ModelId } from "./models";
export { MODELS, PROVIDER_ID } from "./models";
export type { GoogleGenerativeAIProvider, GoogleModelRef } from "./provider";
export {
  createGoogleGenerativeAI,
  createGoogleGenerativeAI as createProvider,
  google,
} from "./provider";
export type { ProviderSettings } from "./types";
