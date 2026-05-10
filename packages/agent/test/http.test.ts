import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../src";
import {
  createChatRouteHandler,
  handleChatRequestBody,
  parseChatRequestBody,
} from "../src/adapters/http";
import { extractLatestUserMessage } from "../src/utils/extract-latest-message";

async function* chunks() {
  yield { type: "message", content: "hello" } as const;
  yield { type: "done" } as const;
}

describe("parseChatRequestBody", () => {
  it("trims optional ids and preserves valid messages", () => {
    expect(
      parseChatRequestBody({
        sessionId: " session-1 ",
        workflowId: " support ",
        stream: false,
        ignored: true,
        messages: [
          {
            role: "user",
            content: "hello",
            metadata: { resume: { selected: ["a"] } },
          },
        ],
      }),
    ).toEqual({
      sessionId: "session-1",
      workflowId: "support",
      stream: false,
      messages: [
        {
          role: "user",
          content: "hello",
          metadata: { resume: { selected: ["a"] } },
        },
      ],
    });
  });

  it("rejects invalid message shapes", () => {
    expect(() =>
      parseChatRequestBody({
        messages: [{ role: "tool", content: "bad" }],
      }),
    ).toThrow();
  });
});

describe("handleChatRequestBody", () => {
  it("buffers the agent stream when stream=false", async () => {
    const streamChat = vi.fn(async () => chunks());
    const response = await handleChatRequestBody({
      agent: { streamChat } satisfies Agent,
      body: {
        sessionId: "session-1",
        workflowId: "workflow-1",
        stream: false,
        messages: [{ role: "user", content: "hello" }],
      },
    });

    expect(response.headers.get("content-type")).toBe("application/json");
    expect(streamChat).toHaveBeenCalledWith(
      [{ role: "user", content: "hello" }],
      { sessionId: "session-1", workflowId: "workflow-1" },
    );
    await expect(response.json()).resolves.toMatchObject({
      text: "hello",
      chunks: [{ type: "message", content: "hello" }, { type: "done" }],
    });
  });

  it("returns an SSE response by default", async () => {
    const streamChat = vi.fn(async () => chunks());
    const response = await handleChatRequestBody({
      agent: { streamChat } satisfies Agent,
      body: {
        messages: [{ role: "user", content: "hello" }],
      },
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });
});

describe("createChatRouteHandler", () => {
  it("returns JSON errors with the configured status", async () => {
    const handler = createChatRouteHandler({
      agent: {
        streamChat: vi.fn(async () => chunks()),
      },
      errorStatus: 422,
    });

    const response = await handler(
      new Request("https://kortyx.test/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "bad", content: "x" }] }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });

  it("returns successful chat responses and stringified non-error failures", async () => {
    const handler = createChatRouteHandler({
      agent: {
        streamChat: vi.fn(async () => chunks()),
      },
    });

    const response = await handler(
      new Request("https://kortyx.test/api/chat", {
        method: "POST",
        body: JSON.stringify({
          stream: false,
          messages: [{ role: "user", content: "x" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ text: "hello" });

    const failing = createChatRouteHandler({
      agent: {
        streamChat: vi.fn(async () => {
          throw "plain failure";
        }),
      },
    });
    const failed = await failing(
      new Request("https://kortyx.test/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "x" }],
        }),
      }),
    );

    expect(failed.status).toBe(400);
    await expect(failed.json()).resolves.toEqual({ error: "plain failure" });
  });
});

describe("extractLatestUserMessage", () => {
  it("returns the last non-empty user message", () => {
    expect(
      extractLatestUserMessage([
        { role: "user", content: " first " },
        { role: "assistant", content: "reply" },
        { role: "user", content: "   " },
        { role: "user", content: " latest " },
      ]),
    ).toBe("latest");
    expect(extractLatestUserMessage([])).toBe("");
    expect(
      extractLatestUserMessage([
        { role: "assistant", content: "reply" },
        { role: "system", content: "system" },
      ]),
    ).toBe("");
  });
});
