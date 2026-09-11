export const PROVIDER_ID = "deepseek" as const;

export const MODELS = [
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-chat",
  "deepseek-reasoner",
] as const;

export type KnownModelId = (typeof MODELS)[number];
export type ModelId = KnownModelId | (string & {});
