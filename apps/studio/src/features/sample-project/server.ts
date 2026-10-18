import "server-only";
import { studioSettings } from "@studio/settings";
import { cookies, headers } from "next/headers";
import { STUDIO_REQUEST_PATH } from "@/lib/studio-routing";
import {
  isSamplePath,
  SAMPLE_REQUEST_HEADER,
  SAMPLE_VISIBILITY_COOKIE,
} from "./routing";

export async function isSampleProject(request?: Request): Promise<boolean> {
  if (request) {
    return (
      isSamplePath(new URL(request.url).pathname) ||
      isSamplePath(request.headers.get(STUDIO_REQUEST_PATH) ?? "")
    );
  }
  const sampleHeader = (await headers()).get(SAMPLE_REQUEST_HEADER);
  return sampleHeader === "1";
}
export async function sampleProjectVisible() {
  if (studioSettings.sampleProjectVisibility)
    return studioSettings.sampleProjectVisibility.get();
  return (await cookies()).get(SAMPLE_VISIBILITY_COOKIE)?.value !== "false";
}

/** Optional account preferences cannot make real project pages unavailable. */
export async function readSampleProjectPreference() {
  try {
    return { visible: await sampleProjectVisible(), available: true };
  } catch {
    return { visible: false, available: false };
  }
}

export async function sampleRequestResponse(
  request: Request,
): Promise<Response | null> {
  if (!(await isSampleProject(request))) return null;
  const preference = await readSampleProjectPreference();
  if (!preference.available)
    return Response.json(
      { error: "Sample project preferences are unavailable." },
      { status: 503 },
    );
  if (!preference.visible)
    return Response.json(
      { error: "Sample project is hidden." },
      { status: 404 },
    );
  const { sampleBrowserResponse } = await import("./http");
  return sampleBrowserResponse(request);
}
