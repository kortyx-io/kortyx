import type { StreamChunk } from "../types/stream-chunk";
import { readStream } from "./read-stream";

export interface StreamFromRouteArgs<TBody = unknown> {
  endpoint: string;
  body: TBody;
  method?: string | undefined;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string> | undefined;
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const readErrorMessage = async (response: Response): Promise<string> => {
  let message = `Request failed (${response.status})`;
  try {
    const payload = (await response.json()) as unknown;
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
    ) {
      message = (payload as { error: string }).error;
    }
  } catch {}
  return message;
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
    });
  } catch (error) {
    yield { type: "error", message: toErrorMessage(error) };
    yield { type: "done" };
    return;
  }

  if (!response.ok) {
    yield { type: "error", message: await readErrorMessage(response) };
    yield { type: "done" };
    return;
  }

  yield* readStream(response.body);
}
