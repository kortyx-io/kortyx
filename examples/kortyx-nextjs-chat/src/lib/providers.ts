import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
  MODELS,
  PROVIDER_ID,
} from "@kortyx/google";

const googleApiKey =
  process.env.GOOGLE_API_KEY ??
  process.env.GEMINI_API_KEY ??
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
  process.env.KORTYX_GOOGLE_API_KEY ??
  process.env.KORTYX_GEMINI_API_KEY;

let googleProvider: GoogleGenerativeAIProvider | undefined;

export const ensureGoogleProvider = (): GoogleGenerativeAIProvider => {
  if (!googleProvider) {
    if (!googleApiKey) {
      throw new Error(
        "Google provider requires an API key. Set GOOGLE_API_KEY, GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, KORTYX_GOOGLE_API_KEY, or KORTYX_GEMINI_API_KEY.",
      );
    }
    googleProvider = createGoogleGenerativeAI({ apiKey: googleApiKey });
  }
  return googleProvider;
};

export const google: GoogleGenerativeAIProvider = ((modelId, options) =>
  ensureGoogleProvider()(modelId, options)) as GoogleGenerativeAIProvider;

google.id = PROVIDER_ID;
google.models = MODELS;
