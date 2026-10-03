import "server-only";
import { studioEdition } from "@/edition";

export async function proxyEvalRequest(request: Request, parts: string[]) {
  const denial = await studioEdition.authorize(request);
  if (denial) return denial;
  const path = parts.join("/");
  if (!/^(targets|runs(?:\/[a-f0-9-]{36}(?:\/cancel)?)?)$/.test(path))
    return Response.json({ error: "Unknown eval route." }, { status: 404 });
  const write = request.method === "POST";
  if (write) {
    let sameOrigin = false;
    try {
      sameOrigin =
        new URL(request.headers.get("origin") ?? "").host ===
        (request.headers.get("host") ?? new URL(request.url).host);
    } catch {
      /* Missing Origin is rejected. */
    }
    if (!sameOrigin || request.headers.get("x-kortyx-eval") !== "1")
      return Response.json(
        { error: "Eval requests must come from this Studio instance." },
        { status: 403 },
      );
  }
  if (!write && request.method !== "GET")
    return Response.json({ error: "Unsupported method." }, { status: 405 });
  const url = process.env.KORTYX_API_URL;
  const credential = await studioEdition.getApiCredential(request);
  if (!url || !credential)
    return Response.json(
      { error: "Studio API is not configured." },
      { status: 503 },
    );
  const body = write ? await request.text() : undefined;
  if (body && body.length > 16_384)
    return Response.json({ error: "Request too large." }, { status: 413 });
  try {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/v1/studio/evals/${path}`,
      {
        method: request.method,
        headers: {
          authorization: credential.authorization,
          "content-type": "application/json",
        },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
        redirect: "error",
      },
    );
    if (!response.ok) {
      const message =
        response.status === 403
          ? "This Studio key cannot run evals."
          : response.status === 409
            ? "Eval configuration changed. Refresh before running."
            : "Eval request failed. Check the consumer connection.";
      return Response.json({ error: message }, { status: response.status });
    }
    return Response.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Eval service is unavailable." },
      { status: 503 },
    );
  }
}
