export const PROVIDER_ID = "google" as const;

export const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
] as const;

export type ModelId = (typeof MODELS)[number];
