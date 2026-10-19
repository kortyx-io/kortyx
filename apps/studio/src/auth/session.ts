import { STUDIO_REQUEST_PATH } from "../lib/studio-routing";
import type { StudioAuthAdapter } from "./contracts";

/** Inspect session validity without invoking interactive navigation policy. */
export async function checkStudioSession(
  request: Request,
  auth: StudioAuthAdapter,
): Promise<Response> {
  const path = request.headers.get(STUDIO_REQUEST_PATH) ?? "";
  const url = new URL(request.url);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
    return new Response(null, { status: 400 });
  const target = new URL(path, url);
  if (
    target.origin !== url.origin ||
    /^\/(api|auth)(\/|$)/.test(target.pathname)
  )
    return new Response(null, { status: 400 });

  let status = "unavailable";
  try {
    status = (await auth.getSessionStatus?.(request)) ?? "unavailable";
  } catch {
    // Auth service failures must not be mistaken for expired sessions.
  }
  if (status === "unavailable")
    return new Response(null, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  return Response.json(
    { reauthenticate: status === "unauthenticated" },
    { headers: { "cache-control": "no-store" } },
  );
}
