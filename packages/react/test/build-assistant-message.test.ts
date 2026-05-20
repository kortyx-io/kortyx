import type { ContentPiece } from "@kortyx/react";
import { describe, expect, it } from "vitest";
import { buildAssistantMessage } from "../src/build-assistant-message";

describe("buildAssistantMessage", () => {
  it("joins only text pieces into the message content", () => {
    const pieces: ContentPiece[] = [
      {
        id: "text-1",
        type: "text",
        content: "Hello ",
      },
      {
        id: "structured-1",
        type: "structured",
        data: {
          streamId: "stream-1",
          dataType: "demo",
          status: "done",
          data: { body: "draft" },
        },
      },
      {
        id: "text-2",
        type: "text",
        content: "world",
      },
    ];

    const message = buildAssistantMessage({
      createId: () => "assistant-1",
      pieces,
      debug: [],
    });

    expect(message).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      content: "Hello world",
      contentPieces: pieces,
    });
  });

  it("omits contentPieces when there are no pieces", () => {
    const message = buildAssistantMessage({
      createId: () => "assistant-2",
      pieces: [],
      debug: [],
    });

    expect(message).toEqual({
      id: "assistant-2",
      role: "assistant",
      content: "",
      debug: [],
    });
  });

  it("preserves whitespace-only text content as-is", () => {
    const pieces: ContentPiece[] = [
      { id: "t1", type: "text", content: "  " },
      { id: "t2", type: "text", content: "\n\t" },
    ];

    const message = buildAssistantMessage({
      createId: () => "assistant-ws",
      pieces,
      debug: [],
    });

    expect(message.content).toBe("  \n\t");
    expect(message.contentPieces).toEqual(pieces);
  });

  it("produces an empty content string when the message is structured-only", () => {
    const pieces: ContentPiece[] = [
      {
        id: "s1",
        type: "structured",
        data: {
          streamId: "stream-1",
          dataType: "demo",
          status: "done",
          data: { score: 1 },
        },
      },
    ];

    const message = buildAssistantMessage({
      createId: () => "assistant-structured",
      pieces,
      debug: [],
    });

    expect(message.content).toBe("");
    expect(message.contentPieces).toEqual(pieces);
  });

  it("produces an empty content string when the message is error-only", () => {
    const pieces: ContentPiece[] = [
      { id: "e1", type: "error", content: "boom" },
    ];

    const message = buildAssistantMessage({
      createId: () => "assistant-error",
      pieces,
      debug: [],
    });

    expect(message.content).toBe("");
    expect(message.contentPieces).toEqual(pieces);
  });

  it("produces an empty content string when the message is interrupt-only", () => {
    const pieces: ContentPiece[] = [
      {
        id: "i1",
        type: "interrupt",
        resumeToken: "tok",
        requestId: "req",
        kind: "text",
        multiple: false,
        options: [],
        question: "Name?",
      },
    ];

    const message = buildAssistantMessage({
      createId: () => "assistant-interrupt",
      pieces,
      debug: [],
    });

    expect(message.content).toBe("");
    expect(message.contentPieces).toEqual(pieces);
  });

  it("includes the full debug payload on the message", () => {
    const debug = [
      { type: "status" as const, message: "starting" },
      { type: "message" as const, content: "hi" },
      { type: "done" as const },
    ];

    const message = buildAssistantMessage({
      createId: () => "assistant-debug",
      pieces: [{ id: "t1", type: "text", content: "hi" }],
      debug,
    });

    expect(message.debug).toBe(debug);
  });

  it("concatenates text pieces in their original ordering even when interleaved with other types", () => {
    const pieces: ContentPiece[] = [
      { id: "t1", type: "text", content: "A" },
      { id: "e1", type: "error", content: "ignored" },
      { id: "t2", type: "text", content: "B" },
      {
        id: "s1",
        type: "structured",
        data: {
          streamId: "stream-1",
          dataType: "demo",
          status: "streaming",
          data: { ok: true },
        },
      },
      { id: "t3", type: "text", content: "C" },
    ];

    const message = buildAssistantMessage({
      createId: () => "assistant-mixed",
      pieces,
      debug: [],
    });

    expect(message.content).toBe("ABC");
  });
});
