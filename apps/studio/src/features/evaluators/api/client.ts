import { studioFetch } from "@/lib/studio-fetch";
import { studioOperation } from "@/usage/client";
export async function evaluatorRequest(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const operation = studioOperation("studio.evaluator", {
    resource: "evaluators",
    evaluator_action:
      body === undefined
        ? "read"
        : path.endsWith("/publish")
          ? "publish"
          : path.endsWith("/archive")
            ? "archive"
            : path.endsWith("/preview")
              ? "preview"
              : path.endsWith("/evidence")
                ? "evidence"
                : path
                  ? "save"
                  : "create",
    action: body === undefined ? "view" : "update",
    origin: body === undefined ? "background" : "foreground",
  });
  try {
    const response = await studioFetch(
      `/api/studio/evaluators${path ? `/${path}` : ""}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          "x-kortyx-evaluator": "1",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(signal ? { signal } : {}),
        cache: "no-store",
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message ?? data.error ?? "Judge request failed.");
    operation.end();
    return data;
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}
