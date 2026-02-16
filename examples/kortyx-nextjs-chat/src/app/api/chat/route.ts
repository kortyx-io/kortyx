import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
};

type ChatRequestBody = {
  sessionId: string;
  workflowId?: string;
  messages: ChatMessage[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toRequestBody = (value: unknown): ChatRequestBody => {
  if (!isRecord(value)) {
    throw new Error("Request body must be an object.");
  }

  const sessionId = value.sessionId;
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new Error("`sessionId` is required.");
  }

  const workflowId = value.workflowId;
  if (workflowId !== undefined && typeof workflowId !== "string") {
    throw new Error("`workflowId` must be a string.");
  }

  const messages = value.messages;
  if (!Array.isArray(messages)) {
    throw new Error("`messages` must be an array.");
  }

  for (const message of messages) {
    if (!isRecord(message)) {
      throw new Error("Each message must be an object.");
    }

    if (
      message.role !== "user" &&
      message.role !== "assistant" &&
      message.role !== "system"
    ) {
      throw new Error("Invalid message role.");
    }

    if (typeof message.content !== "string") {
      throw new Error("Message content must be a string.");
    }
  }

  return {
    sessionId,
    ...(typeof workflowId === "string" && workflowId.length > 0
      ? { workflowId }
      : {}),
    messages: messages as ChatMessage[],
  };
};

export async function POST(request: Request): Promise<Response> {
  try {
    const body = toRequestBody(await request.json());

    return await agent.processChat(body.messages, {
      sessionId: body.sessionId,
      ...(body.workflowId ? { workflowId: body.workflowId } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: {
        "content-type": "application/json",
      },
    });
  }
}
