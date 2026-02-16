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
  };
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
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
  usageMetadata?: unknown;
}

export interface GoogleClient {
  generateContent: (
    modelId: string,
    body: GoogleGenerateContentRequest,
  ) => Promise<GoogleGenerateContentResponse>;
  streamGenerateContent: (
    modelId: string,
    body: GoogleGenerateContentRequest,
  ) => AsyncIterable<GoogleGenerateContentResponse>;
}
