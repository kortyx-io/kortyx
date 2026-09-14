import {
  createFailureResponse,
  parseChatRequestBody,
  readRequestJson,
  toSSE,
} from "kortyx";
import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = parseChatRequestBody(await readRequestJson(request));
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
    return createFailureResponse(error);
  }
}
