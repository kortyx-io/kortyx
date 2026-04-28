export const PROVIDER_ID = "anthropic" as const;

export const MODELS = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-5",
  "claude-opus-4-5-20251101",
  "claude-sonnet-4-0",
  "claude-sonnet-4-20250514",
  "claude-opus-4-1",
  "claude-opus-4-1-20250805",
  "claude-3-haiku-20240307",
] as const;

export type KnownModelId = (typeof MODELS)[number];
export type ModelId = KnownModelId | (string & {});
