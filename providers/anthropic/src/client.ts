import { readSseEvents } from "@kortyx/providers";
import { ProviderConfigurationError, ProviderRequestError } from "./errors";
import type {
  AnthropicClient,
  AnthropicClientConfig,
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
  AnthropicRequestOptions,
  AnthropicStreamEvent,
} from "./types";

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createHeaders = (
  config: Pick<AnthropicClientConfig, "apiKey" | "authToken">,
): Record<string, string> => ({
  "anthropic-version": ANTHROPIC_VERSION,
  "content-type": "application/json",
  ...(config.authToken
    ? { authorization: `Bearer ${config.authToken}` }
    : { "x-api-key": config.apiKey ?? "" }),
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
    `Anthropic provider failed to ${action}: ${message}`,
  );
};

const parseJsonResponse = async (
  response: Response,
  action: string,
): Promise<AnthropicMessagesResponse> => {
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(
      `Anthropic provider failed to ${action}: invalid JSON response (${message})`,
    );
  }

  if (!isRecord(payload)) {
    throw new ProviderRequestError(
      `Anthropic provider failed to ${action}: unexpected response payload.`,
    );
  }

  if (isRecord(payload.error))
    throw new ProviderRequestError(
      String(payload.error.message ?? "Provider returned an error response."),
    );

  return payload as AnthropicMessagesResponse;
};

const resolveFetch = (
  fetchOverride: AnthropicClientConfig["fetch"],
): NonNullable<AnthropicClientConfig["fetch"]> => {
  const fetchImpl = fetchOverride ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ProviderConfigurationError(
      "Global fetch is not available. Provide `fetch` in Anthropic provider settings.",
    );
  }
  return fetchImpl;
};

export const createAnthropicClient = (
  config: AnthropicClientConfig,
): AnthropicClient => {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = resolveFetch(config.fetch);
  const headers = createHeaders(config);

  const createMessage = async (
    body: AnthropicMessagesRequest,
    options?: AnthropicRequestOptions,
  ): Promise<AnthropicMessagesResponse> => {
    const response = await fetchImpl(`${baseUrl}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    await assertOk(response, "invoke content");
    return parseJsonResponse(response, "invoke content");
  };

  const streamMessage = async function* (
    body: AnthropicMessagesRequest,
    options?: AnthropicRequestOptions,
  ): AsyncGenerator<AnthropicStreamEvent> {
    const response = await fetchImpl(`${baseUrl}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    await assertOk(response, "stream content");

    for await (const data of readSseEvents(response)) {
      let payload: unknown;
      try {
        payload = JSON.parse(data) as unknown;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ProviderRequestError(
          `Anthropic provider failed to stream content: invalid SSE JSON (${message})`,
        );
      }

      if (!isRecord(payload)) continue;
      yield payload as AnthropicStreamEvent;
    }
  };

  return {
    createMessage,
    streamMessage,
  };
};
