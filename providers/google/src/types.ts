export type FetchLike = typeof fetch;

export interface ProviderSettings {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export interface GoogleClientConfig {
  apiKey: string;
  baseUrl?: string | undefined;
  fetch?: FetchLike | undefined;
}

export interface GoogleContentPart {
  text?: string | undefined;
}

export interface GoogleContent {
  role: "user" | "model";
  parts: GoogleContentPart[];
}

export interface GoogleGenerateContentRequest {
  contents: GoogleContent[];
  generationConfig?: {
    temperature?: number | undefined;
    maxOutputTokens?: number | undefined;
    stopSequences?: string[] | undefined;
    responseMimeType?: "application/json" | "text/plain" | undefined;
    thinkingConfig?:
      | {
          thinkingBudget?: number | undefined;
          thinkingLevel?: "minimal" | "low" | "medium" | "high" | undefined;
          includeThoughts?: boolean | undefined;
        }
      | undefined;
  };
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
}

export interface GoogleUsageMetadata {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  totalTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
}

export interface GoogleGenerateContentResponse {
  candidates?:
    | Array<{
        content?:
          | {
              parts?: GoogleContentPart[] | undefined;
            }
          | undefined;
        finishReason?: string | undefined;
      }>
    | undefined;
  promptFeedback?: unknown;
  usageMetadata?: GoogleUsageMetadata | undefined;
  modelVersion?: string | undefined;
  responseId?: string | undefined;
}

export interface GoogleRequestOptions {
  signal?: AbortSignal | undefined;
}

export interface GoogleClient {
  generateContent: (
    modelId: string,
    body: GoogleGenerateContentRequest,
    options?: GoogleRequestOptions,
  ) => Promise<GoogleGenerateContentResponse>;
  streamGenerateContent: (
    modelId: string,
    body: GoogleGenerateContentRequest,
    options?: GoogleRequestOptions,
  ) => AsyncIterable<GoogleGenerateContentResponse>;
}
