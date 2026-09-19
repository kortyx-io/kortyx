import type { z } from "zod";

export class StudioReadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "StudioReadError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        requestId: this.requestId,
      },
    };
  }
}

export const normalizeConnectionUrl = (input: string): string => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new StudioReadError(
      "invalid_url",
      "Provide an absolute HTTP(S) connection URL.",
    );
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(url.protocol === "https:" || (url.protocol === "http:" && loopback))
  ) {
    throw new StudioReadError(
      "invalid_url",
      "Connection URLs require HTTPS (HTTP is allowed on loopback), without credentials, query, or fragment.",
    );
  }
  return url.toString().replace(/\/+$/, "");
};

/** Intentionally restricted to the Studio read API: no arbitrary requests or writes. */
export class StudioReadClient {
  readonly apiUrl: string;
  constructor(
    apiUrl: string,
    private readonly apiKey: string,
    private readonly request: typeof fetch = fetch,
  ) {
    this.apiUrl = normalizeConnectionUrl(apiUrl);
    if (!/^ktyx_(?:test|live)_[^_]+_\S+$/.test(apiKey)) {
      throw new StudioReadError(
        "invalid_key",
        "Expected a Kortyx API key with studio:read permission.",
      );
    }
  }

  async get<T>(
    path: string,
    schema: z.ZodType<T>,
    query: Record<string, string> = {},
  ): Promise<T> {
    if (
      !/^\/v1\/studio\/(?:context|catalogs|workflows|(?:runs|sessions|interrupts)(?:\/[^/?#]+)?)$/.test(
        path,
      ) ||
      /(?:^|\/)(?:\.|\.\.|%2e(?:%2e)?)(?:\/|$)/i.test(path)
    ) {
      throw new StudioReadError(
        "invalid_endpoint",
        "Only supported Studio read endpoints are allowed.",
      );
    }
    const url = new URL(`${this.apiUrl}${path}`);
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.request(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new StudioReadError(
        "connection_failed",
        "Studio API request failed or timed out. Check the URL, network/VPN, and TLS. Redirects are not followed.",
      );
    }
    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) {
      await response.body?.cancel();
      const message =
        response.status === 401
          ? "Invalid, expired, or revoked Studio read key."
          : response.status === 403
            ? "The API key lacks studio:read permission."
            : response.status === 404
              ? "Entity not found in this connection's project. Check the URL and selected connection."
              : `Studio API returned HTTP ${response.status}.`;
      // Never echo arbitrary server error bodies: they can contain credentials/content.
      throw new StudioReadError(
        "api_error",
        message,
        response.status,
        requestId,
      );
    }
    let value: unknown;
    const reader = response.body?.getReader();
    if (!reader)
      throw new StudioReadError(
        "invalid_response",
        "Studio returned an empty response.",
      );
    try {
      const decoder = new TextDecoder();
      let body = "";
      let bytes = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 20 * 1024 * 1024) {
          await reader.cancel();
          throw new StudioReadError(
            "response_too_large",
            "Studio response exceeded the 20 MiB safety limit. Use a smaller query or inspect an individual run.",
          );
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      value = JSON.parse(body);
    } catch (error) {
      if (error instanceof StudioReadError) throw error;
      throw new StudioReadError(
        "invalid_response",
        "Could not read Studio JSON response.",
        response.status,
        requestId,
      );
    } finally {
      reader.releaseLock();
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new StudioReadError(
        "schema_mismatch",
        "Studio response does not match this CLI's contracts. Check API/CLI version compatibility.",
        response.status,
        requestId,
      );
    }
    return result.data;
  }
}
