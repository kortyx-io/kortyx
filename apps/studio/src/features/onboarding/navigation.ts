import type { ChapterId } from "./registry";

/** Entry uses the authenticated preference endpoint; callers explicitly explain showing a hidden sample. */
export async function prepareSampleTour(
  {
    action,
    chapter,
    visible,
    returnTo,
    signal,
  }: {
    action: "chapter" | "full" | "resume";
    chapter: ChapterId;
    visible: boolean;
    returnTo: string;
    signal?: AbortSignal;
  },
  request: typeof fetch = fetch,
) {
  const headers = { "content-type": "application/json" };
  if (!visible) {
    const shown = await request("/api/preferences/sample-project", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "visibility", visible: true }),
      signal,
    });
    signal?.throwIfAborted();
    if (!shown.ok) throw new Error("Sample unavailable");
  }
  const entered = await request("/api/preferences/sample-project", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "enter", returnTo }),
    signal,
  });
  signal?.throwIfAborted();
  if (!entered.ok) throw new Error("Sample unavailable");
  const query = new URLSearchParams({
    learn: action,
    ...(action === "chapter" ? { chapter } : {}),
  });
  return { href: `/sample/runs?${query}`, shown: !visible };
}
