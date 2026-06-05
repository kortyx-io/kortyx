import { collectBufferedStream, toSSE } from "@kortyx/stream";
import { z } from "zod";
import type { Agent } from "../chat/create-agent";
import type { ChatMessage } from "../types/chat-message";

export type ChatRequestBody = {
  sessionId?: string | undefined;
  workflowId?: string | undefined;
  stream?: boolean | undefined;
  context?: Record<string, unknown> | undefined;
  messages: ChatMessage[];
};

export type CheckpointRequestBody =
  | {
      action: "list";
      sessionId: string;
    }
  | {
      action: "get";
      checkpointId: string;
    }
  | {
      action: "rollback";
      checkpointId: string;
    }
  | {
      action: "fork";
      checkpointId: string;
      newSessionId?: string | undefined;
    };

const chatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    id: z.string().optional(),
    timestamp: z.number().refine(Number.isFinite).optional(),
  })
  .strict();

const chatRequestBodySchema = z.looseObject({
  sessionId: z.string().optional(),
  workflowId: z.string().optional(),
  stream: z.boolean().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  messages: z.array(chatMessageSchema),
});

const checkpointRequestBodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      sessionId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("get"),
      checkpointId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("rollback"),
      checkpointId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("fork"),
      checkpointId: z.string().min(1),
      newSessionId: z.string().min(1).optional(),
    })
    .strict(),
]);

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function parseChatRequestBody(value: unknown): ChatRequestBody {
  const parsed = chatRequestBodySchema.safeParse(value);
  if (!parsed.success) {
    const [firstIssue] = parsed.error.issues as unknown as [
      { message: string },
      ...Array<{ message: string }>,
    ];
    throw new Error(firstIssue.message);
  }

  const sessionId = parsed.data.sessionId?.trim();
  const workflowId = parsed.data.workflowId?.trim();

  return {
    ...(sessionId ? { sessionId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(typeof parsed.data.stream === "boolean"
      ? { stream: parsed.data.stream }
      : {}),
    ...(parsed.data.context ? { context: parsed.data.context } : {}),
    messages: parsed.data.messages as ChatMessage[],
  };
}

export function parseCheckpointRequestBody(
  value: unknown,
): CheckpointRequestBody {
  const parsed = checkpointRequestBodySchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const [firstIssue] = parsed.error.issues as unknown as [
    { message: string },
    ...Array<{ message: string }>,
  ];
  throw new Error(firstIssue.message);
}

export async function handleChatRequestBody(args: {
  agent: Agent;
  body: ChatRequestBody;
}): Promise<Response> {
  const { agent, body } = args;
  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
    context: body.context,
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

export async function handleCheckpointRequestBody(args: {
  agent: Agent;
  body: CheckpointRequestBody;
}): Promise<Response> {
  const { agent, body } = args;
  const result =
    body.action === "list"
      ? await agent.listCheckpoints(body.sessionId)
      : body.action === "get"
        ? await agent.getCheckpoint(body.checkpointId)
        : body.action === "rollback"
          ? await agent.rollbackTo(body.checkpointId)
          : await agent.fork(body.checkpointId, {
              ...(body.newSessionId ? { newSessionId: body.newSessionId } : {}),
            });

  return new Response(JSON.stringify(result), {
    headers: {
      "content-type": "application/json",
    },
  });
}

export function createCheckpointRouteHandler(args: {
  agent: Agent;
  errorStatus?: number | undefined;
}): (request: Request) => Promise<Response> {
  const { agent, errorStatus = 400 } = args;

  return async function POST(request: Request): Promise<Response> {
    try {
      const body = parseCheckpointRequestBody(await request.json());
      return await handleCheckpointRequestBody({ agent, body });
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
