import type { StreamChunk, StreamFromRouteArgs } from "@kortyx/stream/browser";
import { streamFromRoute } from "@kortyx/stream/browser";

type MaybePromise<T> = T | Promise<T>;

export type OutgoingChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
};

export type ChatTransportContext = {
  sessionId: string;
  workflowId: string;
  messages: OutgoingChatMessage[];
};

export type ChatTransportChunkHandler = (
  chunk: StreamChunk,
) => undefined | boolean | Promise<boolean | undefined>;

export type ChatTransport = {
  stream(
    args: ChatTransportContext & { onChunk: ChatTransportChunkHandler },
  ): Promise<void>;
};

export type ChatTransportChunkSource =
  | Iterable<StreamChunk>
  | AsyncIterable<StreamChunk>;

export function createChatTransport(args: {
  stream: (
    context: ChatTransportContext,
  ) => MaybePromise<ChatTransportChunkSource>;
}): ChatTransport {
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

export type CreateRouteChatTransportArgs<TBody> = Omit<
  StreamFromRouteArgs<TBody>,
  "body"
> & {
  getBody: (context: ChatTransportContext) => TBody;
};

export function createRouteChatTransport<TBody>(
  args: CreateRouteChatTransportArgs<TBody>,
): ChatTransport {
  return createChatTransport({
    stream: (context) => {
      const routeArgs: StreamFromRouteArgs<TBody> = {
        endpoint: args.endpoint,
        body: args.getBody(context),
        ...(args.method ? { method: args.method } : {}),
        ...(args.headers ? { headers: args.headers } : {}),
        ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
      };

      return streamFromRoute({
        ...routeArgs,
      });
    },
  });
}
