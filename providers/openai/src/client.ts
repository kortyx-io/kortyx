import { readSseEvents } from "@kortyx/providers";
import { ProviderConfigurationError, ProviderRequestError } from "./errors";
import type {
  OpenAIChatCompletionChunk,
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIClient,
  OpenAIClientConfig,
  OpenAIRequestOptions,
} from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

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

export const assertOk = async (
  response: Response,
  action: string,
): Promise<void> => {
  if (response.ok) return;
  const message = await parseErrorMessage(response);
  throw new ProviderRequestError(
    `OpenAI provider failed to ${action}: ${message}`,
  );
};

const parseJsonResponse = async (
  response: Response,
  action: string,
): Promise<OpenAIChatCompletionResponse> => {
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(
      `OpenAI provider failed to ${action}: invalid JSON response (${message})`,
    );
  }

  if (!isRecord(payload)) {
    throw new ProviderRequestError(
      `OpenAI provider failed to ${action}: unexpected response payload.`,
    );
  }

  return payload as OpenAIChatCompletionResponse;
};

const resolveFetch = (
  fetchOverride: OpenAIClientConfig["fetch"],
): NonNullable<OpenAIClientConfig["fetch"]> => {
  const fetchImpl = fetchOverride ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ProviderConfigurationError(
      "Global fetch is not available. Provide `fetch` in OpenAI provider settings.",
    );
  }
  return fetchImpl;
};

export const createOpenAIClient = (
  config: OpenAIClientConfig,
): OpenAIClient => {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = resolveFetch(config.fetch);
  const headers = createHeaders(config.apiKey);

  const createChatCompletion = async (
    body: OpenAIChatCompletionRequest,
    options?: OpenAIRequestOptions,
  ): Promise<OpenAIChatCompletionResponse> => {
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
    body: OpenAIChatCompletionRequest,
    options?: OpenAIRequestOptions,
  ): AsyncGenerator<OpenAIChatCompletionChunk> {
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
          `OpenAI provider failed to stream content: invalid SSE JSON (${message})`,
        );
      }

      if (!isRecord(payload)) continue;
      yield payload as OpenAIChatCompletionChunk;
    }
  };

  return {
    createChatCompletion,
    streamChatCompletion,
  };
};

export { readSseEvents } from "@kortyx/providers";
