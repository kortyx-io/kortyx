import { NextResponse } from "next/server";
import { studioEdition } from "@/edition";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const apiUrl = process.env.KORTYX_API_URL;

export async function GET(request: Request): Promise<Response> {
  const denial = await studioEdition.authorize(request);
  if (denial) return denial;
  const credential = await studioEdition.getApiCredential(request);
  if (!apiUrl || !credential) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "The Studio realtime API is not configured.",
      },
      { status: 503 },
    );
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(
    "/v1/studio/changes",
    `${apiUrl.replace(/\/$/, "")}/`,
  );
  const resources = requestUrl.searchParams.get("resources");
  if (resources) upstreamUrl.searchParams.set("resources", resources);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        accept: "text/event-stream",
        authorization: credential.authorization,
      },
      cache: "no-store",
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        {
          error: "upstream_unavailable",
          message: "The Studio realtime stream is unavailable.",
        },
        { status: upstream.status || 502 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    return NextResponse.json(
      {
        error: "upstream_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "The Studio realtime stream is unavailable.",
      },
      { status: 502 },
    );
  }
}
