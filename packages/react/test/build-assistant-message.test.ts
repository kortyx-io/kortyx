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
});
