import { describe, expect, it } from "vitest";
import {
  type ChatTransportContext,
  createChatTransport,
  createRouteChatTransport,
} from "../src/chat-transport";

const baseContext: ChatTransportContext = {
  sessionId: "session-1",
  workflowId: "workflow-1",
  context: {},
  messages: [
    {
      role: "user",
      content: "hello",
    },
  ],
};

describe("createChatTransport", () => {
  it("forwards streamed chunks to onChunk in order", async () => {
    const seen: string[] = [];
    const transport = createChatTransport({
      stream: async function* () {
        yield { type: "status", message: "start" } as const;
        yield { type: "done" } as const;
      },
    });

    await transport.stream({
      ...baseContext,
      onChunk: async (chunk) => {
        seen.push(chunk.type);
        return undefined;
      },
    });

    expect(seen).toEqual(["status", "done"]);
  });

  it("stops when onChunk returns false", async () => {
    const seen: string[] = [];
    const transport = createChatTransport({
      stream: () => [
        { type: "status", message: "start" } as const,
        { type: "status", message: "middle" } as const,
        { type: "done" } as const,
      ],
    });

    await transport.stream({
      ...baseContext,
      onChunk: async (chunk) => {
        seen.push(chunk.type);
        return chunk.type === "status" ? false : undefined;
      },
    });

    expect(seen).toEqual(["status"]);
  });

  it("creates route transports with derived request bodies and optional request settings", async () => {
    const controller = new AbortController();
    let seenInit: RequestInit | undefined;
    const fetchImpl = async (_endpoint: string, init?: RequestInit) => {
      seenInit = init;

      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"status","message":"ok"}\n\n' +
                  "data: [DONE]\n\n",
              ),
            );
            controller.close();
          },
        }),
        { status: 200 },
      );
    };
    const transport = createRouteChatTransport({
      endpoint: "/api/chat",
      method: "PUT",
      headers: { authorization: "Bearer token" },
      fetchImpl: fetchImpl as typeof fetch,
      createBody: (context) => ({
        sessionId: context.sessionId,
        workflowId: context.workflowId,
        tenantId: context.context.tenantId,
        count: context.messages.length,
      }),
    });
    const seen: string[] = [];

    await transport.stream({
      ...baseContext,
      signal: controller.signal,
      onChunk: (chunk) => {
        seen.push(chunk.type);
        return undefined;
      },
    });

    expect(seenInit).toMatchObject({
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      body: JSON.stringify({
        sessionId: "session-1",
        workflowId: "workflow-1",
        tenantId: undefined,
        count: 1,
      }),
    });
    expect(seenInit?.signal).toBe(controller.signal);
    expect(seen).toEqual(["status"]);
  });

  it("creates route transports with the default chat request body", async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl = async (_endpoint: string, init?: RequestInit) => {
      seenInit = init;

      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
        { status: 200 },
      );
    };
    const transport = createRouteChatTransport({
      endpoint: "/api/chat",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await transport.stream({
      ...baseContext,
      context: { userId: "user-1" },
      onChunk: () => undefined,
    });

    expect(seenInit?.body).toBe(
      JSON.stringify({
        sessionId: "session-1",
        workflowId: "workflow-1",
        messages: baseContext.messages,
        context: { userId: "user-1" },
      }),
    );
  });
});
