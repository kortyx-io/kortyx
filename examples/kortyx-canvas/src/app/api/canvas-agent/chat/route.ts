import { collectBufferedStream, parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "@/lib/agent";
import type {
  CanvasAgentClientContext,
  CanvasAgentContext,
} from "@/lib/runtime-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = parseChatRequestBody(await request.json());
    const clientContext = (body.context ?? {}) as CanvasAgentClientContext;
    const history = body.messages
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    const context = buildRuntimeContext(clientContext, history);

    const stream = await agent.streamChat(body.messages, {
      ...(body.sessionId ? { sessionId: body.sessionId } : {}),
      workflowId: body.workflowId,
      context,
    });

    if (body.stream === false) {
      const buffered = await collectBufferedStream(stream);
      return Response.json(buffered);
    }

    return toSSE(stream);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

function buildRuntimeContext(
  clientContext: CanvasAgentClientContext,
  history: CanvasAgentContext["history"] = [],
): CanvasAgentContext {
  return {
    tenantId: "demo",
    userId: "demo-user",
    ...(clientContext.agentId ? { agentId: clientContext.agentId } : {}),
    ...(clientContext.agentLabel
      ? { agentLabel: clientContext.agentLabel }
      : {}),
    ...(clientContext.briefId ? { briefId: clientContext.briefId } : {}),
    ...(clientContext.briefLabel
      ? { briefLabel: clientContext.briefLabel }
      : {}),
    ...(clientContext.currentDiscoveryCanvas
      ? { currentDiscoveryCanvas: clientContext.currentDiscoveryCanvas }
      : {}),
    ...(clientContext.savedDiscoveryCanvasId
      ? { savedDiscoveryCanvasId: clientContext.savedDiscoveryCanvasId }
      : {}),
    ...(clientContext.saveConfirmed ? { saveConfirmed: true } : {}),
    ...(history.length > 0 ? { history } : {}),
  };
}
