import {
  failureHttpStatus,
  KortyxError,
  serializeFailure,
} from "@kortyx/core/errors";
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

/** Read an object-shaped API command without exposing parser/input details. */
export async function readRequestJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Expected a JSON object.");
    return value as Record<string, unknown>;
  } catch (cause) {
    throw new KortyxError(
      "INVALID_REQUEST",
      "Request body is not valid JSON.",
      {
        category: "request",
        retryable: false,
        safeMessage: "The request body must contain a valid JSON object.",
        cause,
      },
    );
  }
}

/** Safe response for custom route handlers. Control flow propagates unchanged. */
export function createFailureResponse(
  error: unknown,
  status?: number,
): Response {
  const failure = serializeFailure(error);
  return Response.json(
    { error: failure.message, failure },
    { status: status ?? failureHttpStatus(failure) },
  );
}

export function parseChatRequestBody(value: unknown): ChatRequestBody {
  const parsed = chatRequestBodySchema.safeParse(value);
  if (!parsed.success) {
    const [firstIssue] = parsed.error.issues as unknown as [
      { message: string },
      ...Array<{ message: string }>,
    ];
    throw new KortyxError("INVALID_REQUEST", firstIssue.message, {
      category: "request",
      retryable: false,
      safeMessage: "The request body is invalid.",
    });
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
  throw new KortyxError("INVALID_REQUEST", firstIssue.message, {
    category: "request",
    retryable: false,
    safeMessage: "The request body is invalid.",
  });
}

export async function handleChatRequestBody(args: {
  abortSignal?: AbortSignal | undefined;
  onExecution?: ((completion: Promise<void>) => void) | undefined;
  agent: Agent;
  body: ChatRequestBody;
}): Promise<Response> {
  const { agent, body } = args;
  const stream = await agent.streamChat(body.messages, {
    ...(args.onExecution ? { onExecution: args.onExecution } : {}),
    ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
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
  onExecution?: ((completion: Promise<void>) => void) | undefined;
  agent: Agent;
  errorStatus?: number | undefined;
}): (request: Request) => Promise<Response> {
  const { agent, errorStatus } = args;

  return async function POST(request: Request): Promise<Response> {
    try {
      const body = parseChatRequestBody(await readRequestJson(request));
      return await handleChatRequestBody({
        agent,
        body,
        abortSignal: request.signal,
        onExecution: args.onExecution,
      });
    } catch (error) {
      return createFailureResponse(error, errorStatus);
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
  const { agent, errorStatus } = args;

  return async function POST(request: Request): Promise<Response> {
    try {
      const body = parseCheckpointRequestBody(await readRequestJson(request));
      return await handleCheckpointRequestBody({ agent, body });
    } catch (error) {
      return createFailureResponse(error, errorStatus);
    }
  };
}
