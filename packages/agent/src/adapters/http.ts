import {
  failureHttpStatus,
  KortyxError,
  serializeFailure,
} from "@kortyx/core/errors";
import { collectBufferedStream, toSSE } from "@kortyx/stream";
import { z } from "zod";
import type { Agent } from "../chat/create-agent";
import {
  ChatLifecycleHookError,
  type ChatLifecyclePhase,
  type ChatResponseFinalized,
} from "../chat/lifecycle";
import { parseResumeMeta } from "../interrupt/resume-handler";
import type { ChatMessage } from "../types/chat-message";

export type ChatRequestBody = {
  sessionId?: string | undefined;
  workflowId?: string | undefined;
  stream?: boolean | undefined;
  context?: Record<string, unknown> | undefined;
  clientTurnId?: string | undefined;
  messages: ChatMessage[];
};

export type ChatLifecycleErrorEvent = {
  phase: ChatLifecyclePhase;
  clientTurnId?: string;
  error: ChatLifecycleHookError;
};

export type ChatRouteHandlerOptions = {
  agent: Agent;
  errorStatus?: number | undefined;
  onExecution?: ((completion: Promise<void>) => void) | undefined;
  /** Defaults to cancel. Continue requires onExecution to retain host lifetime. */
  disconnect?: "cancel" | "continue" | undefined;
  onTurnAccepted?:
    | ((event: {
        request: Request;
        sessionId: string;
        clientTurnId: string;
        userMessage: ChatMessage & { role: "user" };
        kind: "prompt" | "interrupt-response";
      }) => void | Promise<void>)
    | undefined;
  onResponseFinalized?:
    | ((
        event: ChatResponseFinalized & { request: Request },
      ) => void | Promise<void>)
    | undefined;
  onLifecycleError?:
    | ((event: ChatLifecycleErrorEvent) => void | Promise<void>)
    | undefined;
};

export type CheckpointRouteHandlerOptions = {
  agent: Agent;
  errorStatus?: number | undefined;
  onForked?:
    | ((event: {
        request: Request;
        sourceSessionId: string;
        newSessionId: string;
        sourceCheckpointId: string;
        newCheckpointId: string;
      }) => void | Promise<void>)
    | undefined;
  onRolledBack?:
    | ((event: {
        request: Request;
        sessionId: string;
        headCheckpointId: string;
        invalidatedStructuredStreamIds: string[];
      }) => void | Promise<void>)
    | undefined;
  onLifecycleError?:
    | ((event: ChatLifecycleErrorEvent) => void | Promise<void>)
    | undefined;
};

const reportLifecycleError = async (
  callback: ChatRouteHandlerOptions["onLifecycleError"],
  event: ChatLifecycleErrorEvent,
) => {
  if (!callback) {
    console.error("[chat:lifecycle]", event.error);
    return;
  }
  try {
    await callback(event);
  } catch (error) {
    console.error("[chat:onLifecycleError]", serializeFailure(error));
  }
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
  clientTurnId: z.string().max(128).optional(),
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
  const clientTurnId = parsed.data.clientTurnId?.trim();

  return {
    ...(sessionId ? { sessionId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(clientTurnId ? { clientTurnId } : {}),
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
  continueOnDisconnect?: boolean | undefined;
  onResponseFinalized?:
    | ((event: ChatResponseFinalized) => void | Promise<void>)
    | undefined;
  agent: Agent;
  body: ChatRequestBody;
}): Promise<Response> {
  const { agent, body } = args;
  if (args.onResponseFinalized && (!body.sessionId || !body.clientTurnId)) {
    throw new KortyxError(
      "INVALID_REQUEST",
      "sessionId and clientTurnId are required with onResponseFinalized.",
      {
        category: "request",
        retryable: false,
        safeMessage: "This chat request needs a session and turn ID.",
      },
    );
  }
  const stream = await agent.streamChat(body.messages, {
    ...(args.onExecution ? { onExecution: args.onExecution } : {}),
    ...(body.clientTurnId ? { clientTurnId: body.clientTurnId } : {}),
    ...(args.continueOnDisconnect ? { continueOnDisconnect: true } : {}),
    ...(args.onResponseFinalized
      ? { onResponseFinalized: args.onResponseFinalized }
      : {}),
    ...(args.abortSignal && !args.continueOnDisconnect
      ? { abortSignal: args.abortSignal }
      : {}),
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

export function createChatRouteHandler(
  args: ChatRouteHandlerOptions,
): (request: Request) => Promise<Response> {
  const { agent, errorStatus } = args;
  if (args.disconnect === "continue" && !args.onExecution) {
    throw new Error(
      'disconnect: "continue" requires onExecution to retain host lifetime.',
    );
  }

  return async function POST(request: Request): Promise<Response> {
    try {
      const body = parseChatRequestBody(await readRequestJson(request));
      if (args.onTurnAccepted || args.onResponseFinalized) {
        if (!body.sessionId || !body.clientTurnId) {
          throw new KortyxError(
            "INVALID_REQUEST",
            "sessionId and clientTurnId are required with chat lifecycle hooks.",
            {
              category: "request",
              retryable: false,
              safeMessage: "This chat request needs a session and turn ID.",
            },
          );
        }
        const userMessage = body.messages.at(-1);
        if (!userMessage || userMessage.role !== "user") {
          throw new KortyxError(
            "INVALID_REQUEST",
            "The last chat message must be from the user.",
            {
              category: "request",
              retryable: false,
              safeMessage: "The chat request needs a user message.",
            },
          );
        }
        if (args.onTurnAccepted) {
          try {
            await args.onTurnAccepted({
              request,
              sessionId: body.sessionId,
              clientTurnId: body.clientTurnId,
              userMessage: { ...userMessage, role: "user" },
              kind: parseResumeMeta(userMessage)
                ? "interrupt-response"
                : "prompt",
            });
          } catch (cause) {
            const error = new ChatLifecycleHookError("turn-accepted", cause);
            await reportLifecycleError(args.onLifecycleError, {
              phase: "turn-accepted",
              clientTurnId: body.clientTurnId,
              error,
            });
            throw error;
          }
        }
      }
      return await handleChatRequestBody({
        agent,
        body,
        abortSignal: request.signal,
        onExecution: args.onExecution,
        continueOnDisconnect: args.disconnect === "continue",
        ...(args.onResponseFinalized
          ? {
              onResponseFinalized: async (event: ChatResponseFinalized) => {
                try {
                  await args.onResponseFinalized?.({ ...event, request });
                } catch (cause) {
                  await reportLifecycleError(args.onLifecycleError, {
                    phase: "response-finalized",
                    clientTurnId: event.clientTurnId,
                    error: new ChatLifecycleHookError(
                      "response-finalized",
                      cause,
                    ),
                  });
                }
              },
            }
          : {}),
      });
    } catch (error) {
      return createFailureResponse(error, errorStatus);
    }
  };
}

export async function handleCheckpointRequestBody(args: {
  agent: Agent;
  body: CheckpointRequestBody;
  request?: Request | undefined;
  onForked?: CheckpointRouteHandlerOptions["onForked"];
  onRolledBack?: CheckpointRouteHandlerOptions["onRolledBack"];
  onLifecycleError?: CheckpointRouteHandlerOptions["onLifecycleError"];
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

  if (args.request && body.action === "fork" && args.onForked) {
    const fork = result as Awaited<ReturnType<Agent["fork"]>>;
    try {
      await args.onForked({
        request: args.request,
        sourceSessionId: fork.parentSessionId,
        newSessionId: fork.sessionId,
        sourceCheckpointId: fork.forkedFrom,
        newCheckpointId: fork.checkpoint.id,
      });
    } catch (cause) {
      await reportLifecycleError(args.onLifecycleError, {
        phase: "forked",
        error: new ChatLifecycleHookError("forked", cause),
      });
    }
  }
  if (args.request && body.action === "rollback" && args.onRolledBack) {
    const rollback = result as Awaited<ReturnType<Agent["rollbackTo"]>>;
    try {
      await args.onRolledBack({
        request: args.request,
        sessionId: rollback.sessionId,
        headCheckpointId: rollback.head,
        invalidatedStructuredStreamIds: rollback.invalidatedStructuredStreamIds,
      });
    } catch (cause) {
      await reportLifecycleError(args.onLifecycleError, {
        phase: "rolled-back",
        error: new ChatLifecycleHookError("rolled-back", cause),
      });
    }
  }

  return new Response(JSON.stringify(result), {
    headers: {
      "content-type": "application/json",
    },
  });
}

export function createCheckpointRouteHandler(
  args: CheckpointRouteHandlerOptions,
): (request: Request) => Promise<Response> {
  const { agent, errorStatus } = args;

  return async function POST(request: Request): Promise<Response> {
    try {
      const body = parseCheckpointRequestBody(await readRequestJson(request));
      return await handleCheckpointRequestBody({
        agent,
        body,
        request,
        onForked: args.onForked,
        onRolledBack: args.onRolledBack,
        onLifecycleError: args.onLifecycleError,
      });
    } catch (error) {
      return createFailureResponse(error, errorStatus);
    }
  };
}
