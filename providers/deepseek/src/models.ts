export const PROVIDER_ID = "deepseek" as const;

export const MODELS = ["deepseek-chat", "deepseek-reasoner"] as const;

export type KnownModelId = (typeof MODELS)[number];
export type ModelId = KnownModelId | (string & {});
