export const PROVIDER_ID = "mistral" as const;

export const MODELS = [
  "mistral-medium-3-5",
  "ministral-3b-latest",
  "ministral-8b-latest",
  "ministral-14b-latest",
  "mistral-large-latest",
  "mistral-medium-latest",
  "mistral-large-2512",
  "mistral-small-latest",
  "mistral-small-2603",
] as const;

export type KnownModelId = (typeof MODELS)[number];
export type ModelId = KnownModelId | (string & {});
