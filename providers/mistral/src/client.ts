import { assertProviderResponse } from "@kortyx/core/errors";
import { readSseEvents } from "@kortyx/providers";
import { ProviderConfigurationError, ProviderRequestError } from "./errors";
import type {
  MistralChatCompletionChunk,
  MistralChatCompletionRequest,
  MistralChatCompletionResponse,
  MistralClient,
  MistralClientConfig,
  MistralRequestOptions,
} from "./types";

const DEFAULT_BASE_URL = "https://api.mistral.ai/v1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createHeaders = (apiKey: string): Record<string, string> => ({
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json",
});

const assertOk = (response: Response, action: string): Promise<void> =>
  assertProviderResponse("mistral", response, action);

const parseJsonResponse = async (
  response: Response,
  action: string,
): Promise<MistralChatCompletionResponse> => {
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(
      `Mistral provider failed to ${action}: invalid JSON response (${message})`,
      { cause: error },
    );
  }

  if (!isRecord(payload)) {
    throw new ProviderRequestError(
      `Mistral provider failed to ${action}: unexpected response payload.`,
    );
  }

  if (isRecord(payload.error))
    throw new ProviderRequestError(
      String(payload.error.message ?? "Provider returned an error response."),
    );

  return payload as MistralChatCompletionResponse;
};

const resolveFetch = (
  fetchOverride: MistralClientConfig["fetch"],
): NonNullable<MistralClientConfig["fetch"]> => {
  const fetchImpl = fetchOverride ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ProviderConfigurationError(
      "Global fetch is not available. Provide `fetch` in Mistral provider settings.",
    );
  }
  return fetchImpl;
};

export const createMistralClient = (
  config: MistralClientConfig,
): MistralClient => {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = resolveFetch(config.fetch);
  const headers = createHeaders(config.apiKey);

  const createChatCompletion = async (
    body: MistralChatCompletionRequest,
    options?: MistralRequestOptions,
  ): Promise<MistralChatCompletionResponse> => {
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
    body: MistralChatCompletionRequest,
    options?: MistralRequestOptions,
  ): AsyncGenerator<MistralChatCompletionChunk> {
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
          `Mistral provider failed to stream content: invalid SSE JSON (${message})`,
          { cause: error },
        );
      }

      if (!isRecord(payload)) continue;
      yield payload as MistralChatCompletionChunk;
    }
  };

  return {
    createChatCompletion,
    streamChatCompletion,
  };
};
