import { describe, expect, it } from "vitest";
import {
  type ChatTransportContext,
  createChatTransport,
  createRouteChatTransport,
} from "../src/chat-transport";

const baseContext: ChatTransportContext = {
  sessionId: "session-1",
  workflowId: "workflow-1",
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
    const fetchImpl = async (_endpoint: string, init?: RequestInit) => {
      expect(init).toMatchObject({
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer token",
        },
        body: JSON.stringify({
          sessionId: "session-1",
          workflowId: "workflow-1",
          count: 1,
        }),
      });

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
      getBody: (context) => ({
        sessionId: context.sessionId,
        workflowId: context.workflowId,
        count: context.messages.length,
      }),
    });
    const seen: string[] = [];

    await transport.stream({
      ...baseContext,
      onChunk: (chunk) => {
        seen.push(chunk.type);
        return undefined;
      },
    });

    expect(seen).toEqual(["status"]);
  });
});
