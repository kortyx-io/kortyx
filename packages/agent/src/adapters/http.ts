import { z } from "zod";
import type { Agent } from "../chat/create-agent";
import type { ChatMessage } from "../types/chat-message";

export type ChatRequestBody = {
  sessionId: string;
  workflowId?: string | undefined;
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
    sessionId: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => value.length > 0, {
        message: "`sessionId` is required.",
      }),
    workflowId: z.string().optional(),
    messages: z.array(chatMessageSchema),
  })
  .strict();

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function parseChatRequestBody(value: unknown): ChatRequestBody {
  const parsed = chatRequestBodySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid chat request.");
  }

  const workflowId = parsed.data.workflowId?.trim();

  return {
    sessionId: parsed.data.sessionId,
    ...(workflowId ? { workflowId } : {}),
    messages: parsed.data.messages as ChatMessage[],
  };
}

export async function processChatRequestBody(args: {
  agent: Agent;
  body: ChatRequestBody;
}): Promise<Response> {
  const { agent, body } = args;
  return agent.processChat(body.messages, {
    sessionId: body.sessionId,
    ...(body.workflowId ? { workflowId: body.workflowId } : {}),
  });
}

export function createChatRouteHandler(args: {
  agent: Agent;
  errorStatus?: number | undefined;
}): (request: Request) => Promise<Response> {
  const { agent, errorStatus = 400 } = args;

  return async function POST(request: Request): Promise<Response> {
    try {
      const body = parseChatRequestBody(await request.json());
      return await processChatRequestBody({ agent, body });
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
