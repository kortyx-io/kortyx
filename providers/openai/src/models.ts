export const PROVIDER_ID = "openai" as const;

export const MODELS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.4-pro",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "o4-mini",
] as const;

export type KnownModelId = (typeof MODELS)[number];
export type ModelId = KnownModelId | (string & {});
