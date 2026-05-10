import { type StreamChunk, streamFromRoute } from "@kortyx/stream/browser";
import { describe, expect, it, vi } from "vitest";
import { streamChatFromRoute } from "../src/adapters/http-client";

vi.mock("@kortyx/stream/browser", () => ({
  streamFromRoute: vi.fn(async function* (args: unknown) {
    yield { type: "message", content: "ok", args };
  }),
}));

describe("streamChatFromRoute", () => {
  it("delegates to streamFromRoute with optional fetch and headers", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const messages = [{ role: "user" as const, content: "hello" }];

    const chunks: StreamChunk[] = [];
    for await (const chunk of streamChatFromRoute({
      endpoint: "/api/chat",
      sessionId: "session-1",
      workflowId: "workflow-1",
      messages,
      fetchImpl,
      headers: { authorization: "Bearer token" },
    })) {
      chunks.push(chunk);
    }

    expect(streamFromRoute).toHaveBeenCalledWith({
      endpoint: "/api/chat",
      fetchImpl,
      headers: { authorization: "Bearer token" },
      body: {
        sessionId: "session-1",
        workflowId: "workflow-1",
        messages,
      },
    });
    expect(chunks).toEqual([
      {
        type: "message",
        content: "ok",
        args: {
          endpoint: "/api/chat",
          fetchImpl,
          headers: { authorization: "Bearer token" },
          body: {
            sessionId: "session-1",
            workflowId: "workflow-1",
            messages,
          },
        },
      },
    ]);
  });

  it("omits optional fetch and headers when they are not provided", async () => {
    const messages = [{ role: "user" as const, content: "hello" }];

    for await (const _chunk of streamChatFromRoute({
      endpoint: "/api/chat",
      messages,
    })) {
      // drain stream
    }

    expect(streamFromRoute).toHaveBeenLastCalledWith({
      endpoint: "/api/chat",
      body: {
        sessionId: undefined,
        workflowId: undefined,
        messages,
      },
    });
  });
});
