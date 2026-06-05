import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("awaits each onChunk before delivering the next chunk", async () => {
    const events: string[] = [];
    const transport = createChatTransport({
      stream: async function* () {
        yield { type: "status", message: "a" } as const;
        yield { type: "status", message: "b" } as const;
        yield { type: "status", message: "c" } as const;
        yield { type: "done" } as const;
      },
    });

    await transport.stream({
      ...baseContext,
      onChunk: async (chunk) => {
        if (chunk.type === "status") {
          events.push(`start:${chunk.message}`);
          await new Promise<void>((resolve) => setTimeout(resolve, 5));
          events.push(`end:${chunk.message}`);
        } else {
          events.push(chunk.type);
        }
        return undefined;
      },
    });

    expect(events).toEqual([
      "start:a",
      "end:a",
      "start:b",
      "end:b",
      "start:c",
      "end:c",
      "done",
    ]);
  });

  it("falls back to the global fetch when no fetchImpl is supplied", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const transport = createRouteChatTransport({
      endpoint: "/api/chat",
    });

    await transport.stream({
      ...baseContext,
      onChunk: () => undefined,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls.at(0);
    expect(firstCall?.[0]).toBe("/api/chat");
  });

  it("adds checkpoint methods when a checkpoint endpoint is configured", async () => {
    const requests: Array<{
      endpoint: string;
      init?: RequestInit | undefined;
    }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (endpoint, init) => {
      requests.push({ endpoint: String(endpoint), init });
      const body = JSON.parse(String(init?.body));
      if (body.action === "list") {
        return Response.json([
          {
            id: "cp-1",
            sessionId: body.sessionId,
            turnIndex: 0,
            createdAt: 1,
            nodes: [],
            workflow: "workflow-1",
          },
        ]);
      }
      if (body.action === "rollback") {
        return Response.json({
          sessionId: "session-1",
          head: body.checkpointId,
          invalidatedStructuredStreamIds: ["stream-1"],
          invalidatedInterruptTokens: ["token-1"],
          activePendingRequests: [],
        });
      }
      return Response.json({
        sessionId: body.newSessionId ?? "child",
        parentSessionId: "session-1",
        forkedFrom: body.checkpointId,
        checkpoint: {
          id: "child-cp",
          sessionId: body.newSessionId ?? "child",
          runId: "run-1",
          turnIndex: 0,
          createdAt: 1,
          nodes: [],
          workflow: "workflow-1",
          state: {},
          effects: { structuredStreamIds: [], interruptTokens: [] },
          activePendingRequests: [],
        },
      });
    });
    const transport = createRouteChatTransport({
      endpoint: "/api/chat",
      checkpointEndpoint: "/api/checkpoints",
      headers: { authorization: "Bearer token" },
      fetchImpl,
    });

    await expect(transport.listCheckpoints?.("session-1")).resolves.toEqual([
      expect.objectContaining({ id: "cp-1" }),
    ]);
    await expect(transport.rollbackTo?.("cp-1")).resolves.toMatchObject({
      head: "cp-1",
      invalidatedStructuredStreamIds: ["stream-1"],
    });
    await expect(
      transport.fork?.("cp-1", { newSessionId: "child-session" }),
    ).resolves.toMatchObject({
      sessionId: "child-session",
      forkedFrom: "cp-1",
    });

    expect(requests.map((request) => request.endpoint)).toEqual([
      "/api/checkpoints",
      "/api/checkpoints",
      "/api/checkpoints",
    ]);
    expect(
      requests.map((request) => JSON.parse(String(request.init?.body))),
    ).toEqual([
      { action: "list", sessionId: "session-1" },
      { action: "rollback", checkpointId: "cp-1" },
      { action: "fork", checkpointId: "cp-1", newSessionId: "child-session" },
    ]);
    expect(requests[0]?.init?.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer token",
    });
  });

  it("surfaces checkpoint endpoint errors with parsed or fallback messages", async () => {
    const transport = createRouteChatTransport({
      endpoint: "/api/chat",
      checkpointEndpoint: "/api/checkpoints",
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({ error: "No access" }, { status: 403 }),
        )
        .mockResolvedValueOnce(Response.json({ error: 123 }, { status: 409 }))
        .mockResolvedValueOnce(new Response("not-json", { status: 500 })),
    });

    await expect(transport.rollbackTo?.("cp-1")).rejects.toThrow("No access");
    await expect(transport.rollbackTo?.("cp-2")).rejects.toThrow(
      "Checkpoint request failed with status 409",
    );
    await expect(transport.listCheckpoints?.("session-1")).rejects.toThrow(
      "Checkpoint request failed with status 500",
    );
  });

  it("uses global fetch for checkpoint methods and omits empty fork options", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_endpoint, init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        sessionId: "child",
        parentSessionId: "session-1",
        forkedFrom: body.checkpointId,
        checkpoint: {
          id: "child-cp",
          sessionId: "child",
          runId: "run-1",
          turnIndex: 0,
          createdAt: 1,
          nodes: [],
          workflow: "workflow-1",
          state: {},
          effects: { structuredStreamIds: [], interruptTokens: [] },
          activePendingRequests: [],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const transport = createRouteChatTransport({
      endpoint: "/api/chat",
      checkpointEndpoint: "/api/checkpoints",
    });

    await expect(transport.fork?.("cp-1")).resolves.toMatchObject({
      sessionId: "child",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "fork",
      checkpointId: "cp-1",
    });
  });
});
