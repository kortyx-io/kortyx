import { StudioTableIdSchema } from "@kortyx/telemetry-contracts";
import { studioAuth } from "@studio/auth";
import { sampleRequestResponse } from "@/features/sample-project/server";
import { resolveStudioAuthMode } from "@/lib/studio-auth";
export const runtime = "nodejs";
async function proxy(
  request: Request,
  context: { params: Promise<{ tableId: string }> },
) {
  const denial = await studioAuth.authorize(request);
  if (denial) return denial;
  const sample = await sampleRequestResponse(request);
  if (sample) return sample;
  if (resolveStudioAuthMode() === "none")
    return Response.json(
      { error: "Database preferences require authenticated Studio access." },
      { status: 403 },
    );
  const parsed = StudioTableIdSchema.safeParse((await context.params).tableId);
  if (!parsed.success)
    return Response.json({ error: "Unknown table." }, { status: 400 });
  if (request.method === "POST") {
    let sameOrigin = false;
    try {
      sameOrigin =
        new URL(request.headers.get("origin") ?? "").host ===
        (request.headers.get("host") ?? new URL(request.url).host);
    } catch {
      /* invalid origin */
    }
    if (!sameOrigin || request.headers.get("x-kortyx-preferences") !== "1")
      return Response.json({ error: "Request denied." }, { status: 403 });
  }
  const credential = await studioAuth.getApiCredential(request);
  const base = process.env.KORTYX_API_URL;
  if (!credential || !base)
    return Response.json({ error: "Studio API unavailable." }, { status: 503 });
  let body: string | undefined;
  if (request.method === "POST") {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 131072) {
          await reader.cancel();
          return Response.json(
            { error: "Request too large." },
            { status: 413 },
          );
        }
        chunks.push(chunk.value);
      }
    body = Buffer.concat(chunks).toString("utf8");
  }
  try {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/v1/studio/table-preferences/${parsed.data}`,
      {
        method: request.method,
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          authorization: credential.authorization,
          "content-type": "application/json",
          ...(credential.projectId
            ? { "x-kortyx-project-id": credential.projectId }
            : {}),
          ...(credential.environmentId
            ? { "x-kortyx-environment-id": credential.environmentId }
            : {}),
          ...(credential.environment
            ? { "x-kortyx-environment": credential.environment }
            : {}),
        },
      },
    );
    return Response.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Preferences service unavailable." },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
