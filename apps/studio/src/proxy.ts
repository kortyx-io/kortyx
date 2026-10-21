import { studioAuth } from "@studio/auth";
import { type NextRequest, NextResponse } from "next/server";
import {
  isSamplePath,
  SAMPLE_REQUEST_HEADER,
  SAMPLE_RETURN_COOKIE,
  safeSampleReturn,
  samplePath,
} from "@/features/sample-project/routing";
import { readSampleProjectPreference } from "@/features/sample-project/server";
import { STUDIO_REQUEST_PATH } from "@/lib/studio-routing";

export async function proxy(request: NextRequest): Promise<Response> {
  // This handler uses the auth adapter's noninteractive session check.
  // Applying API admission first would hide expiry behind a 401/403.
  if (request.nextUrl.pathname === "/api/studio/session")
    return NextResponse.next();
  const denial = await studioAuth.authorize(request);
  if (denial) return denial;
  const sampleRoute = isSamplePath(request.nextUrl.pathname);
  const sampleIntent = isSamplePath(
    request.headers.get(STUDIO_REQUEST_PATH) ?? "",
  );
  // A same-server rewrite may pass through proxy again. Its explicit sample
  // intent still selects only immutable data, never a real project credential.
  const sample =
    sampleRoute ||
    (sampleIntent && !/^\/(api|auth)\//.test(request.nextUrl.pathname));
  const browserSample =
    (request.nextUrl.pathname.startsWith("/api/studio/") && sampleIntent) ||
    (sampleRoute &&
      /^\/api\/studio\/diagnostics\/[^/]+$/.test(
        samplePath(request.nextUrl.pathname),
      ));
  const preference =
    sample || browserSample ? await readSampleProjectPreference() : undefined;
  if (preference && !preference.available)
    return Response.json(
      { error: "Sample project preferences are unavailable." },
      { status: 503 },
    );
  if (preference && !preference.visible) {
    return browserSample
      ? Response.json({ error: "Sample project is hidden." }, { status: 404 })
      : NextResponse.redirect(
          new URL(
            safeSampleReturn(request.cookies.get(SAMPLE_RETURN_COOKIE)?.value),
            request.url,
          ),
        );
  }
  // This Studio-owned summary composes existing immutable sample reads.
  // Its route handler reauthorizes the request and preserves sample intent.
  if (
    browserSample &&
    request.method === "GET" &&
    request.nextUrl.pathname === "/api/studio/evals/comparison"
  )
    return NextResponse.next();
  if (browserSample) {
    const { sampleBrowserResponse } = await import(
      "@/features/sample-project/http"
    );
    return sampleBrowserResponse(request);
  }
  const forwarded = new Headers(request.headers);
  forwarded.delete(SAMPLE_REQUEST_HEADER);
  if (sample) {
    const path = samplePath(request.nextUrl.pathname);
    if (
      !/^\/(runs|sessions|workflows|interrupts|evals|prompts|settings|diagnostics)(\/|$)/.test(
        path,
      )
    )
      return new Response("Not found", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD")
      return Response.json(
        { error: "Sample project is read-only." },
        { status: 403 },
      );
    forwarded.set(SAMPLE_REQUEST_HEADER, "1");
    const destination = request.nextUrl.clone();
    destination.pathname = path;
    if (!sampleRoute)
      return NextResponse.next({ request: { headers: forwarded } });
    forwarded.set(STUDIO_REQUEST_PATH, request.nextUrl.pathname);
    return NextResponse.rewrite(destination, {
      request: { headers: forwarded },
    });
  }
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|css|js|map|txt|xml|json)).*)",
  ],
};
