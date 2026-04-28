export const PROVIDER_ID = "mistral" as const;

export const MODELS = [
  "ministral-3b-latest",
  "ministral-8b-latest",
  "ministral-14b-latest",
  "mistral-large-latest",
  "mistral-medium-latest",
  "mistral-large-2512",
  "mistral-medium-2508",
  "mistral-medium-2505",
  "mistral-small-2506",
  "mistral-small-latest",
  "mistral-small-2603",
  "magistral-medium-latest",
  "magistral-small-latest",
  "magistral-medium-2509",
  "magistral-small-2509",
  "pixtral-large-latest",
] as const;

export type KnownModelId = (typeof MODELS)[number];
export type ModelId = KnownModelId | (string & {});
