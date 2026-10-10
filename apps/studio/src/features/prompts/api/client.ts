import { studioFetch } from "@/lib/studio-fetch";
import { STUDIO_REQUEST_PATH } from "@/lib/studio-routing";
export async function promptRequest(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  scopePath?: string,
): Promise<unknown> {
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
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message ?? data.error ?? "Prompt request failed.");
  return data;
}
