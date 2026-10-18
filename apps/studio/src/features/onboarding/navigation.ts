import type { PageGuideId } from "./page-help-registry";
import type { TourEntryAction } from "./progress";
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
    action: TourEntryAction;
    chapter: ChapterId;
    visible: boolean;
    returnTo: string;
    signal?: AbortSignal;
  },
  request: typeof fetch = fetch,
) {
  await enterSample({ visible, returnTo, signal }, request);
  const query = new URLSearchParams({
    learn: action,
    ...(action === "chapter" || action === "resume-chapter" ? { chapter } : {}),
  });
  return { href: `/sample/runs?${query}`, shown: !visible };
}

type SampleEntry = { visible: boolean; returnTo: string; signal?: AbortSignal };
async function enterSample(
  { visible, returnTo, signal }: SampleEntry,
  request: typeof fetch,
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
}

/** Called only after choosing Open sample example in the page-help dialog. */
export async function prepareSamplePage(
  input: {
    page: PageGuideId;
    visible: boolean;
    returnTo: string;
    signal?: AbortSignal;
  },
  request: typeof fetch = fetch,
) {
  const { pageGuide } = await import("./page-help-registry");
  const destination = pageGuide(input.page).example;
  if (!destination) throw new Error("No sample example for this page");
  await enterSample(input, request);
  const url = new URL(`/sample${destination}`, "http://sample.local");
  url.searchParams.set("explain", "1");
  return { href: `${url.pathname}${url.search}`, shown: !input.visible };
}
