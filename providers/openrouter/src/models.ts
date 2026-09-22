export const PROVIDER_ID = "openrouter" as const;

// OpenRouter's catalogue changes continuously. Keep the selector open instead
// of publishing a stale snapshot as autocomplete.
export const MODELS = [] as const;

export type ModelId = string & {};
