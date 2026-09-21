import { STUDIO_API_PROTOCOL_VERSION } from "@kortyx/telemetry-contracts";
import type { z } from "zod";

export type StudioCompatibility = {
  protocolVersion: string | null;
  release: string | null;
};

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
  compatibility: StudioCompatibility = {
    protocolVersion: null,
    release: null,
  };
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
          "x-kortyx-studio-api-version": STUDIO_API_PROTOCOL_VERSION,
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
    this.compatibility = {
      protocolVersion: response.headers.get("x-kortyx-studio-api-version"),
      release: response.headers.get("x-kortyx-studio-release"),
    };
    if (
      this.compatibility.protocolVersion &&
      this.compatibility.protocolVersion !== STUDIO_API_PROTOCOL_VERSION
    ) {
      await response.body?.cancel();
      throw new StudioReadError(
        "incompatible_studio_api",
        `This CLI supports Studio API v${STUDIO_API_PROTOCOL_VERSION}, but the server reports v${this.compatibility.protocolVersion}${this.compatibility.release ? ` (${this.compatibility.release})` : ""}. Install a CLI and Studio release that use the same Studio API major.`,
        response.status,
        requestId,
      );
    }
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
      const server = this.compatibility.protocolVersion
        ? `Studio API v${this.compatibility.protocolVersion}${this.compatibility.release ? ` (${this.compatibility.release})` : ""}`
        : "a server that did not report its Studio API version";
      throw new StudioReadError(
        "schema_mismatch",
        `Studio response does not match this CLI's Studio API v${STUDIO_API_PROTOCOL_VERSION} contracts. The response came from ${server}. Upgrade both components if this server predates protocol negotiation; otherwise report this as an API compatibility regression.`,
        response.status,
        requestId,
      );
    }
    return result.data;
  }
}
