import { describe, expect, it } from "vitest";
import {
  type ChatTransportContext,
  createChatTransport,
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
});
