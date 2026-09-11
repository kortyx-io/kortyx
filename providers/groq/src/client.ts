import { readSseEvents } from "@kortyx/providers";
import { ProviderConfigurationError, ProviderRequestError } from "./errors";
import type {
  GroqChatCompletionChunk,
  GroqChatCompletionRequest,
  GroqChatCompletionResponse,
  GroqClient,
  GroqClientConfig,
  GroqRequestOptions,
} from "./types";

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createHeaders = (apiKey: string): Record<string, string> => ({
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json",
});

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) return `HTTP ${response.status}`;
    const error = payload.error;
    if (!isRecord(error)) return `HTTP ${response.status}`;
    const message = error.message;
    if (typeof message !== "string" || message.trim().length === 0) {
      return `HTTP ${response.status}`;
    }
    return message;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const assertOk = async (response: Response, action: string): Promise<void> => {
  if (response.ok) return;
  const message = await parseErrorMessage(response);
  throw new ProviderRequestError(
    `Groq provider failed to ${action}: ${message}`,
  );
};

const parseJsonResponse = async (
  response: Response,
  action: string,
): Promise<GroqChatCompletionResponse> => {
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(
      `Groq provider failed to ${action}: invalid JSON response (${message})`,
    );
  }

  if (!isRecord(payload)) {
    throw new ProviderRequestError(
      `Groq provider failed to ${action}: unexpected response payload.`,
    );
  }

  if (isRecord(payload.error))
    throw new ProviderRequestError(
      String(payload.error.message ?? "Provider returned an error response."),
    );

  return payload as GroqChatCompletionResponse;
};

const resolveFetch = (
  fetchOverride: GroqClientConfig["fetch"],
): NonNullable<GroqClientConfig["fetch"]> => {
  const fetchImpl = fetchOverride ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ProviderConfigurationError(
      "Global fetch is not available. Provide `fetch` in Groq provider settings.",
    );
  }
  return fetchImpl;
};

export const createGroqClient = (config: GroqClientConfig): GroqClient => {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = resolveFetch(config.fetch);
  const headers = createHeaders(config.apiKey);

  const createChatCompletion = async (
    body: GroqChatCompletionRequest,
    options?: GroqRequestOptions,
  ): Promise<GroqChatCompletionResponse> => {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    await assertOk(response, "invoke content");
    return parseJsonResponse(response, "invoke content");
  };

  const streamChatCompletion = async function* (
    body: GroqChatCompletionRequest,
    options?: GroqRequestOptions,
  ): AsyncGenerator<GroqChatCompletionChunk> {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    await assertOk(response, "stream content");

    for await (const data of readSseEvents(response)) {
      if (data === "[DONE]") return;
      let payload: unknown;
      try {
        payload = JSON.parse(data) as unknown;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ProviderRequestError(
          `Groq provider failed to stream content: invalid SSE JSON (${message})`,
        );
      }

      if (!isRecord(payload)) continue;
      yield payload as GroqChatCompletionChunk;
    }
  };

  return {
    createChatCompletion,
    streamChatCompletion,
  };
};
