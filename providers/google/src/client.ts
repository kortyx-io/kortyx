import { readSseEvents } from "@kortyx/providers";
import { ProviderConfigurationError, ProviderRequestError } from "./errors";
import type {
  GoogleClient,
  GoogleClientConfig,
  GoogleGenerateContentRequest,
  GoogleGenerateContentResponse,
  GoogleRequestOptions,
} from "./types";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getModelPath = (modelId: string): string =>
  modelId.includes("/") ? modelId : `models/${modelId}`;

const createHeaders = (apiKey: string): Record<string, string> => ({
  "content-type": "application/json",
  "x-goog-api-key": apiKey,
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
    `Google provider failed to ${action}: ${message}`,
  );
};

const parseGenerateResponse = async (
  response: Response,
  action: string,
): Promise<GoogleGenerateContentResponse> => {
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(
      `Google provider failed to ${action}: invalid JSON response (${message})`,
    );
  }

  if (!isRecord(payload)) {
    throw new ProviderRequestError(
      `Google provider failed to ${action}: unexpected response payload.`,
    );
  }

  if (isRecord(payload.error))
    throw new ProviderRequestError(
      String(payload.error.message ?? "Provider returned an error response."),
    );

  return payload as GoogleGenerateContentResponse;
};

const resolveFetch = (
  fetchOverride: GoogleClientConfig["fetch"],
): NonNullable<GoogleClientConfig["fetch"]> => {
  const fetchImpl = fetchOverride ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ProviderConfigurationError(
      "Global fetch is not available. Provide `fetch` in Google provider settings.",
    );
  }
  return fetchImpl;
};

export const createGoogleClient = (
  config: GoogleClientConfig,
): GoogleClient => {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = resolveFetch(config.fetch);
  const headers = createHeaders(config.apiKey);

  const generateContent = async (
    modelId: string,
    body: GoogleGenerateContentRequest,
    options?: GoogleRequestOptions,
  ): Promise<GoogleGenerateContentResponse> => {
    const response = await fetchImpl(
      `${baseUrl}/${getModelPath(modelId)}:generateContent`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        ...(options?.signal ? { signal: options.signal } : {}),
      },
    );

    await assertOk(response, "invoke content");
    return parseGenerateResponse(response, "invoke content");
  };

  const streamGenerateContent = async function* (
    modelId: string,
    body: GoogleGenerateContentRequest,
    options?: GoogleRequestOptions,
  ): AsyncGenerator<GoogleGenerateContentResponse> {
    const response = await fetchImpl(
      `${baseUrl}/${getModelPath(modelId)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        ...(options?.signal ? { signal: options.signal } : {}),
      },
    );

    await assertOk(response, "stream content");

    for await (const data of readSseEvents(response)) {
      if (data === "[DONE]") return;
      let payload: unknown;
      try {
        payload = JSON.parse(data) as unknown;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ProviderRequestError(
          `Google provider failed to stream content: invalid SSE JSON (${message})`,
        );
      }

      if (!isRecord(payload)) continue;
      yield payload as GoogleGenerateContentResponse;
    }
  };

  return {
    generateContent,
    streamGenerateContent,
  };
};
