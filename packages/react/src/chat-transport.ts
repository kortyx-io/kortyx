import type { StreamChunk, StreamFromRouteArgs } from "@kortyx/stream/browser";
import { streamFromRoute } from "@kortyx/stream/browser";

type MaybePromise<T> = T | Promise<T>;
type DefaultChatContext = Record<string, unknown>;

export type OutgoingChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
};

export type ChatTransportContext<TContext = DefaultChatContext> = {
  sessionId: string;
  workflowId: string;
  messages: OutgoingChatMessage[];
  context: TContext;
  signal?: AbortSignal | undefined;
};

export type ChatTransportChunkHandler = (
  chunk: StreamChunk,
) => undefined | boolean | Promise<boolean | undefined>;

export type CheckpointSummary = {
  id: string;
  sessionId: string;
  turnIndex: number;
  createdAt: number;
  nodes: string[];
  workflow: string;
  label?: string;
};

export type RollbackCheckpointResult = {
  sessionId: string;
  head: string;
  invalidatedStructuredStreamIds: string[];
  invalidatedInterruptTokens: string[];
};

export type ForkCheckpointResult = {
  sessionId: string;
  parentSessionId: string;
  forkedFrom: string;
};

export type ChatTransport<TContext = DefaultChatContext> = {
  stream(
    args: ChatTransportContext<TContext> & {
      onChunk: ChatTransportChunkHandler;
    },
  ): Promise<void>;
  listCheckpoints?: (sessionId: string) => Promise<CheckpointSummary[]>;
  rollbackTo?: (checkpointId: string) => Promise<RollbackCheckpointResult>;
  fork?: (
    checkpointId: string,
    options?: { newSessionId?: string },
  ) => Promise<ForkCheckpointResult>;
};

export type ChatTransportChunkSource =
  | Iterable<StreamChunk>
  | AsyncIterable<StreamChunk>;

export function createChatTransport<TContext = DefaultChatContext>(args: {
  stream: (
    context: ChatTransportContext<TContext>,
  ) => MaybePromise<ChatTransportChunkSource>;
}): ChatTransport<TContext> {
  return {
    async stream({ onChunk, ...context }) {
      for await (const chunk of await args.stream(context)) {
        const shouldContinue = await onChunk(chunk);
        if (chunk.type === "done" || shouldContinue === false) {
          break;
        }
      }
    },
  };
}

export type RouteChatRequestBody<TContext = DefaultChatContext> = {
  sessionId: string;
  workflowId: string;
  messages: OutgoingChatMessage[];
  context: TContext;
};

export type CreateRouteChatTransportArgs<TBody, TContext> = Omit<
  StreamFromRouteArgs<TBody>,
  "body"
> & {
  createBody?: ((context: ChatTransportContext<TContext>) => TBody) | undefined;
  checkpointEndpoint?: string | undefined;
};

export function createRouteChatTransport<
  TContext = DefaultChatContext,
  TBody = RouteChatRequestBody<TContext>,
>(
  args: CreateRouteChatTransportArgs<TBody, TContext>,
): ChatTransport<TContext> {
  const transport = createChatTransport<TContext>({
    stream: (context) => {
      const body =
        args.createBody?.(context) ??
        ({
          sessionId: context.sessionId,
          workflowId: context.workflowId,
          messages: context.messages,
          context: context.context,
        } as TBody);
      const routeArgs: StreamFromRouteArgs<TBody> = {
        endpoint: args.endpoint,
        body,
        ...(args.method ? { method: args.method } : {}),
        ...(args.headers ? { headers: args.headers } : {}),
        ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
        ...(context.signal ? { signal: context.signal } : {}),
      };

      return streamFromRoute({
        ...routeArgs,
      });
    },
  });

  if (!args.checkpointEndpoint) return transport;

  const fetchJson = async <TResult>(
    body: Record<string, unknown>,
  ): Promise<TResult> => {
    const fetchImpl = args.fetchImpl ?? fetch;
    const response = await fetchImpl(args.checkpointEndpoint as string, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(args.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let message = `Checkpoint request failed with status ${response.status}`;
      try {
        const parsed = (await response.json()) as { error?: unknown };
        if (typeof parsed.error === "string") message = parsed.error;
      } catch {}
      throw new Error(message);
    }
    return (await response.json()) as TResult;
  };

  return {
    ...transport,
    listCheckpoints: (sessionId) =>
      fetchJson<CheckpointSummary[]>({ action: "list", sessionId }),
    rollbackTo: (checkpointId) =>
      fetchJson<RollbackCheckpointResult>({
        action: "rollback",
        checkpointId,
      }),
    fork: (checkpointId, options) =>
      fetchJson<ForkCheckpointResult>({
        action: "fork",
        checkpointId,
        ...(options?.newSessionId
          ? { newSessionId: options.newSessionId }
          : {}),
      }),
  };
}
