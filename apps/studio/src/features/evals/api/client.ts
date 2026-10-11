import { studioFetch } from "@/lib/studio-fetch";
import { studioFeature, studioOperation } from "@/usage/client";
export async function evalRequest(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const action = path.endsWith("/cancel")
    ? "cancel"
    : body === undefined
      ? "view"
      : "launch";
  const scope = studioOperation("studio.eval", {
    action,
    origin: body === undefined ? "background" : "foreground",
  });
  if (body !== undefined) studioFeature("studio.eval", { action });
  try {
    const response = await studioFetch(`/api/studio/evals/${path}`, {
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-kortyx-eval": "1",
            },
            body: JSON.stringify(body),
          }),
      cache: "no-store",
      signal,
    });
    if (!response.ok)
      scope.end("failed", {
        phase: "http",
        http_status: String(response.status),
      });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "Eval request failed.");
    scope.end();
    return json;
  } catch (error) {
    if (signal?.aborted) scope.end("cancelled");
    scope.fail(error);
    throw error;
  }
}
