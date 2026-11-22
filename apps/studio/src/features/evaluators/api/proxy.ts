import "server-only";
import { STUDIO_API_PROTOCOL_VERSION } from "@kortyx/telemetry-contracts";
import { studioAuth } from "@studio/auth";
import { sampleRequestResponse } from "@/features/sample-project/server";
import { readBoundedJson } from "@/lib/read-bounded-json";
export async function proxyEvaluatorRequest(request: Request, parts: string[]) {
  const denied = await studioAuth.authorize(request);
  if (denied) return denied;
  const sample = await sampleRequestResponse(request);
  if (sample) return sample;
  const path = parts.join("/");
  if (
    !/^(?:score-groups(?:\/[a-f0-9-]{36}(?:\/(?:publish|archive|versions\/[1-9][0-9]*))?)?|recordings|executions\/[a-f0-9-]{36}|[a-f0-9-]{36}(?:\/(?:publish|archive|preview|evidence|metadata))?)?$/.test(
      path,
    )
  )
    return Response.json({ error: "Unknown judge route." }, { status: 404 });
  const write = request.method === "POST";
  if (!write && request.method !== "GET")
    return Response.json({ error: "Unsupported method." }, { status: 405 });
  if (write) {
    let origin = false;
    try {
      origin =
        new URL(request.headers.get("origin") ?? "").host ===
        (request.headers.get("host") ?? new URL(request.url).host);
    } catch {}
    if (!origin || request.headers.get("x-kortyx-evaluator") !== "1")
      return Response.json(
        { error: "Evaluator requests must originate in Studio." },
        { status: 403 },
      );
  }
  const credential = await studioAuth.getApiCredential(request),
    url = process.env.KORTYX_API_URL;
  if (!credential || !url)
    return Response.json(
      { error: "Studio API is not configured." },
      { status: 503 },
    );
  try {
    const body = write
      ? JSON.stringify(await readBoundedJson(new Response(request.body), 65536))
      : undefined;
    const response = await fetch(
      `${url.replace(/\/$/, "")}/v1/studio/evaluators${path ? `/${path}` : ""}${new URL(request.url).search}`,
      {
        method: request.method,
        headers: {
          authorization: credential.authorization,
          "content-type": "application/json",
          "x-kortyx-studio-api-version": STUDIO_API_PROTOCOL_VERSION,
          ...(credential.environment
            ? { "x-kortyx-environment": credential.environment }
            : {}),
          ...(credential.environmentId
            ? { "x-kortyx-environment-id": credential.environmentId }
            : {}),
          ...(credential.projectId
            ? { "x-kortyx-project-id": credential.projectId }
            : {}),
        },
        ...(body ? { body } : {}),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
        cache: "no-store",
        redirect: "error",
      },
    );
    return Response.json(
      await readBoundedJson(
        response,
        // A group is bounded by the 64 KB write limit. Reads may include up to
        // 200 draft/latest pairs or 100 saved versions, plus JSON escaping.
        path.startsWith("score-groups") ? 32000000 : 2000000,
      ),
      {
        status: response.status,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          "Evaluator service is unavailable or the request exceeds its size limit.",
      },
      { status: 503 },
    );
  }
}
