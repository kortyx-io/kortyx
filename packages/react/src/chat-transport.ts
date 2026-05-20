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

export type ChatTransport<TContext = DefaultChatContext> = {
  stream(
    args: ChatTransportContext<TContext> & {
      onChunk: ChatTransportChunkHandler;
    },
  ): Promise<void>;
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
};

export function createRouteChatTransport<
  TContext = DefaultChatContext,
  TBody = RouteChatRequestBody<TContext>,
>(
  args: CreateRouteChatTransportArgs<TBody, TContext>,
): ChatTransport<TContext> {
  return createChatTransport<TContext>({
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
}
