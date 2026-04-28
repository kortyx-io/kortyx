export const PROVIDER_ID = "groq" as const;

export const MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3-32b",
] as const;

export type KnownModelId = (typeof MODELS)[number];
export type ModelId = KnownModelId | (string & {});
