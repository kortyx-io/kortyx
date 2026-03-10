import { collectBufferedStream, parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    // Keep route extensible for auth/rate-limit/observability hooks.
    const body = parseChatRequestBody(await request.json());

    const stream = await agent.streamChat(body.messages, {
      sessionId: body.sessionId,
      workflowId: body.workflowId,
    });

    if (body.stream === false) {
      const buffered = await collectBufferedStream(stream);
      return new Response(JSON.stringify(buffered), {
        headers: { "content-type": "application/json" },
      });
    }

    return toSSE(stream);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
