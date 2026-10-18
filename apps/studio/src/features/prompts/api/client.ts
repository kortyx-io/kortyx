import { studioFetch } from "@/lib/studio-fetch";
import { STUDIO_REQUEST_PATH } from "@/lib/studio-routing";
import { studioFeature, studioOperation } from "@/usage/client";
export async function promptRequest(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  scopePath?: string,
): Promise<unknown> {
  const action =
    body && typeof body === "object" && "action" in body
      ? body.action
      : path === "export"
        ? "export"
        : path.startsWith("transfers/")
          ? "import"
          : body === undefined
            ? "view"
            : "update";
  const scope = studioOperation("studio.prompt", {
    action,
    origin: body === undefined ? "background" : "foreground",
  });
  if (body !== undefined) studioFeature("studio.prompt", { action });
  try {
    const response = await (scopePath ? fetch : studioFetch)(
      `/api/studio/prompts/${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          "x-kortyx-prompts": "1",
          ...(scopePath ? { [STUDIO_REQUEST_PATH]: scopePath } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
        ...(signal ? { signal } : {}),
      },
    );
    if (!response.ok)
      scope.end("failed", {
        phase: "http",
        http_status: String(response.status),
      });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message ?? data.error ?? "Prompt request failed.");
    scope.end();
    return data;
  } catch (error) {
    if (signal?.aborted) scope.end("cancelled");
    scope.fail(error);
    throw error;
  }
}
