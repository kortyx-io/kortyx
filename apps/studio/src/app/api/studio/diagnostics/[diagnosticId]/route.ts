import { createHash } from "node:crypto";
import { DiagnosticResponseSchema } from "@kortyx/telemetry-contracts";
import { studioAuth } from "@studio/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ diagnosticId: string }> },
) {
  const denial = await studioAuth.authorize(request);
  if (denial) return denial;
  const credential = await studioAuth.getApiCredential(request);
  if (!process.env.KORTYX_API_URL || !credential)
    return Response.json({ error: "not_configured" }, { status: 503 });
  const { diagnosticId } = await params;
  const env = new URL(request.url).searchParams.get("env");
  if (!/^[a-f0-9-]{36}$/i.test(diagnosticId) || !env || env.length > 256)
    return Response.json({ error: "invalid_diagnostic" }, { status: 400 });
  const upstream = new URL(
    `/v1/studio/diagnostics/${diagnosticId}`,
    process.env.KORTYX_API_URL,
  );
  upstream.searchParams.set("env", env);
  upstream.searchParams.set("download", "1");
  try {
    const response = await fetch(upstream, {
      headers: {
        authorization: credential.authorization,
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
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      return Response.json(
        { error: "diagnostic_unavailable" },
        { status: response.status },
      );
    const diagnostic = DiagnosticResponseSchema.parse(await response.json());
    if (diagnostic.state !== "available" || !diagnostic.content)
      return Response.json(
        { error: "diagnostic_incomplete", state: diagnostic.state },
        { status: 409 },
      );
    const bytes = JSON.stringify(diagnostic.content);
    if (
      createHash("sha256").update(bytes).digest("hex") !==
        diagnostic.contentChecksum ||
      Buffer.byteLength(bytes) !== diagnostic.contentByteLength
    )
      return Response.json(
        { error: "diagnostic_integrity_failed" },
        { status: 502 },
      );
    return new Response(bytes, {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="diagnostic-${diagnosticId}.json"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "diagnostic_download_failed" },
      { status: 502 },
    );
  }
}
