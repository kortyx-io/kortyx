import {
  errorFromFailure,
  isFailureDescriptor,
  KortyxError,
} from "@kortyx/core/errors";
import { failureChunk } from "../failure";
import type { StreamChunk } from "../types/stream-chunk";
import { readStream } from "./read-stream";

export interface StreamFromRouteArgs<TBody = unknown> {
  endpoint: string;
  body: TBody;
  method?: string | undefined;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
}

const readErrorMessage = async (response: Response): Promise<Error> => {
  let message = `Request failed (${response.status})`;
  try {
    const payload = (await response.json()) as unknown;
    if (
      payload &&
      typeof payload === "object" &&
      "failure" in payload &&
      isFailureDescriptor(payload.failure)
    )
      return errorFromFailure(payload.failure);
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
    ) {
      message = (payload as { error: string }).error;
    }
  } catch {}
  return new KortyxError("HTTP_REQUEST_FAILED", message, {
    category: "transport",
    status: response.status,
    safeMessage: message,
  });
};

export async function* streamFromRoute<TBody = unknown>(
  args: StreamFromRouteArgs<TBody>,
): AsyncGenerator<StreamChunk, void, void> {
  const fetchFn = args.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    yield { type: "error", message: "No fetch implementation available." };
    yield { type: "done" };
    return;
  }

  let response: Response;
  try {
    response = await fetchFn(args.endpoint, {
      method: args.method ?? "POST",
      headers: {
        "content-type": "application/json",
        ...(args.headers ?? {}),
      },
      body: JSON.stringify(args.body),
      ...(args.signal ? { signal: args.signal } : {}),
    });
  } catch (error) {
    if (args.signal?.aborted) throw error;
    yield failureChunk(
      new KortyxError("NETWORK_ERROR", "Network request failed.", {
        category: "transport",
        cause: error,
        safeMessage: "The request could not reach the server.",
      }),
    );
    yield { type: "done" };
    return;
  }

  if (!response.ok) {
    yield failureChunk(await readErrorMessage(response));
    yield { type: "done" };
    return;
  }

  yield* readStream(response.body);
}
