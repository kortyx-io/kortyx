import "server-only";
import {
  ClearScoreResponseSchema,
  StudioReviewRequestSchema,
  StudioScoreResponseSchema,
} from "@kortyx/telemetry-contracts";
import { studioAuth } from "@studio/auth";

export async function studioReviewRequest(
  request: Request,
  runId: string,
): Promise<Response> {
  const denial = await studioAuth.authorize(request);
  if (denial) return denial;
  let sameOrigin = false;
  try {
    sameOrigin =
      new URL(request.headers.get("origin") ?? "").host ===
      (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    /* Missing or malformed Origin is rejected. */
  }
  if (!sameOrigin || request.headers.get("x-kortyx-review") !== "1")
    return Response.json(
      { error: "Review requests must come from this Studio instance." },
      { status: 403 },
    );
  if (request.method !== "POST" && request.method !== "DELETE")
    return Response.json({ error: "Unsupported method." }, { status: 405 });
  const apiUrl = process.env.KORTYX_API_URL;
  const credential = await studioAuth.getApiCredential(request);
  if (!apiUrl || !credential)
    return Response.json(
      { error: "Studio API is not configured." },
      { status: 503 },
    );
  let body: string | undefined;
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return Response.json({ error: "Expected JSON." }, { status: 415 });
    const text = await request.text();
    if (text.length > 16_384)
      return Response.json({ error: "Request too large." }, { status: 413 });
    try {
      body = JSON.stringify(StudioReviewRequestSchema.parse(JSON.parse(text)));
    } catch {
      return Response.json(
        {
          error:
            "Invalid review. Choose a correctness verdict and a note of at most 4000 characters.",
        },
        { status: 400 },
      );
    }
  }
  try {
    const upstream = await fetch(
      `${apiUrl.replace(/\/$/, "")}/v1/studio/runs/${encodeURIComponent(runId)}/review`,
      {
        method: request.method,
        headers: {
          authorization: credential.authorization,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!upstream.ok) {
      const message =
        upstream.status === 403
          ? "This Studio key does not have review write permission or environment access."
          : upstream.status === 404
            ? "Run not found."
            : "Could not save review. Please try again.";
      return Response.json({ error: message }, { status: upstream.status });
    }
    const json = await upstream.json();
    return Response.json(
      request.method === "POST"
        ? StudioScoreResponseSchema.parse(json)
        : ClearScoreResponseSchema.parse(json),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "The Studio API is unavailable. Please try again." },
      { status: 503 },
    );
  }
}
