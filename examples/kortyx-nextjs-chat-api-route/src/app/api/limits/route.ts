import { parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = parseChatRequestBody(await request.json());
    return toSSE(
      await agent.streamChat(body.messages, {
        abortSignal: request.signal,
        sessionId: body.sessionId,
        workflowId: "limit-demo",
        // Server policy; never copy execution limits from an untrusted request.
        limits: { maxChildInvocations: 1 },
      }),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
