import "server-only";
import { studioAuth } from "@studio/auth";
export async function proxyPromptRequest(request: Request, parts: string[]) {
  const denial = await studioAuth.authorize(request);
  if (denial) return denial;
  const path = parts.join("/");
  if (
    !/^(library|actions|export|assets\/[a-f0-9-]{36}|transfers\/plan|transfers\/[a-f0-9-]{36}\/apply)$/.test(
      path,
    )
  )
    return Response.json({ error: "Unknown prompt route." }, { status: 404 });
  if (request.method !== "GET" && request.method !== "POST")
    return Response.json({ error: "Unsupported method." }, { status: 405 });
  if (request.method === "POST") {
    try {
      if (
        new URL(request.headers.get("origin") ?? "").host !==
          (request.headers.get("host") ?? new URL(request.url).host) ||
        request.headers.get("x-kortyx-prompts") !== "1"
      )
        throw new Error();
    } catch {
      return Response.json(
        { error: "Prompt requests must come from this Studio instance." },
        { status: 403 },
      );
    }
  }
  const url = process.env.KORTYX_API_URL,
    credential = await studioAuth.getApiCredential(request);
  if (!url || !credential)
    return Response.json(
      { error: "Studio API is not configured." },
      { status: 503 },
    );
  let body: string | undefined;
  if (request.method === "POST") {
    const maxBytes = path === "transfers/plan" ? 20 * 1024 * 1024 : 1_048_576;
    const reader = request.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      const parts: string[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            return Response.json(
              { error: "Request too large." },
              { status: 413 },
            );
          }
          parts.push(decoder.decode(chunk.value, { stream: true }));
        }
        parts.push(decoder.decode());
        body = parts.join("");
      } catch {
        return Response.json(
          { error: "Could not read request." },
          { status: 400 },
        );
      }
    }
  }
  if (path === "export" && body) {
    try {
      body = JSON.stringify({ ...JSON.parse(body), apiUrl: url });
    } catch {
      return Response.json(
        { error: "Invalid export request." },
        { status: 400 },
      );
    }
  }
  try {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/v1/studio/prompts${path === "library" ? "" : `/${path}`}${new URL(request.url).search}`,
      {
        method: request.method,
        headers: {
          authorization: credential.authorization,
          "content-type": "application/json",
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
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      },
    );
    return Response.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Prompt service is unavailable." },
      { status: 503 },
    );
  }
}
