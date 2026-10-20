import { studioFetch } from "@/lib/studio-fetch";
import { studioFeature, studioOperation } from "@/usage/client";

function overrideFacts(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const has = (key: string) => {
    try {
      const field = Object.getOwnPropertyDescriptor(body, key);
      return !!field && "value" in field && field.value !== undefined;
    } catch {
      return false;
    }
  };
  return {
    settings_override: [
      "caseTimeoutMs",
      "runTimeoutMs",
      "concurrency",
      "repetitions",
      "judge",
    ].some(has),
    case_timeout_override: has("caseTimeoutMs"),
    run_timeout_override: has("runTimeoutMs"),
  };
}
export async function evalRequest(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const action =
    path === "settings" && body !== undefined
      ? "save"
      : path.endsWith("/cancel")
        ? "cancel"
        : body === undefined
          ? "view"
          : "launch";
  const scope = studioOperation(
    path === "settings" ? "studio.settings" : "studio.eval",
    {
      action,
      resource: "evals",
      ...overrideFacts(body),
      origin: body === undefined ? "background" : "foreground",
    },
  );
  if (body !== undefined)
    studioFeature(path === "settings" ? "studio.settings" : "studio.eval", {
      action,
    });
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
    const json = await response.json().catch((error) => {
      if (signal?.aborted) throw error;
      return null;
    });
    if (!response.ok)
      throw new Error(
        typeof json?.error === "string"
          ? json.error
          : `Eval service returned HTTP ${response.status}. Try again when the connection recovers.`,
      );
    if (json === null)
      throw new Error("Eval service returned an invalid response.");
    scope.end();
    return json;
  } catch (error) {
    if (signal?.aborted) scope.end("cancelled");
    scope.fail(error);
    throw error;
  }
}
