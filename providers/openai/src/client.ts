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

const assertOk = async (response: Response, action: string): Promise<void> => {
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

const extractSseData = (eventBlock: string): string | undefined => {
  const lines = eventBlock.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return undefined;
  return dataLines.join("\n");
};

async function* readSseEvents(response: Response): AsyncGenerator<string> {
  const body = response.body;
  if (!body) {
    throw new ProviderRequestError(
      "OpenAI provider failed to stream content: response body is empty.",
    );
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");

    let split = buffer.indexOf("\n\n");
    while (split !== -1) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const data = extractSseData(block);
      if (data) yield data;
      split = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode().replaceAll("\r\n", "\n");
  const data = extractSseData(buffer);
  if (data) yield data;
}

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
