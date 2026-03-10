import { collectBufferedStream, toSSE } from "@kortyx/stream";
import { z } from "zod";
import type { Agent } from "../chat/create-agent";
import type { ChatMessage } from "../types/chat-message";

export type ChatRequestBody = {
  sessionId?: string | undefined;
  workflowId?: string | undefined;
  stream?: boolean | undefined;
  messages: ChatMessage[];
};

const chatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    metadata: z.record(z.unknown()).optional(),
    id: z.string().optional(),
    timestamp: z.number().finite().optional(),
  })
  .strict();

const chatRequestBodySchema = z
  .object({
    sessionId: z.string().optional(),
    workflowId: z.string().optional(),
    stream: z.boolean().optional(),
    messages: z.array(chatMessageSchema),
  })
  .passthrough();

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function parseChatRequestBody(value: unknown): ChatRequestBody {
  const parsed = chatRequestBodySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid chat request.");
  }

  const sessionId = parsed.data.sessionId?.trim();
  const workflowId = parsed.data.workflowId?.trim();

  return {
    ...(sessionId ? { sessionId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(typeof parsed.data.stream === "boolean"
      ? { stream: parsed.data.stream }
      : {}),
    messages: parsed.data.messages as ChatMessage[],
  };
}

export async function handleChatRequestBody(args: {
  agent: Agent;
  body: ChatRequestBody;
}): Promise<Response> {
  const { agent, body } = args;
  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
  });

  if (body.stream === false) {
    const buffered = await collectBufferedStream(stream);
    return new Response(JSON.stringify(buffered), {
      headers: {
        "content-type": "application/json",
      },
    });
  }

  return toSSE(stream);
}

export function createChatRouteHandler(args: {
  agent: Agent;
  errorStatus?: number | undefined;
}): (request: Request) => Promise<Response> {
  const { agent, errorStatus = 400 } = args;

  return async function POST(request: Request): Promise<Response> {
    try {
      const body = parseChatRequestBody(await request.json());
      return await handleChatRequestBody({ agent, body });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: toErrorMessage(error),
        }),
        {
          status: errorStatus,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }
  };
}
