import { describe, expect, it } from "vitest";
import { createFinalizedChatMessageAccumulator } from "../src/structured/finalized-chat-message";

describe("createFinalizedChatMessageAccumulator", () => {
  it("reduces text, structured updates and an interrupt into one stable message", () => {
    const output = createFinalizedChatMessageAccumulator("turn-1");
    output.apply({ type: "text-start", node: "answer" });
    output.apply({ type: "text-delta", node: "answer", delta: "Hello" });
    output.apply({
      type: "structured-data",
      streamId: "brief",
      dataType: "brief",
      kind: "set",
      path: "title",
      value: "Draft",
    });
    output.apply({
      type: "structured-data",
      streamId: "brief",
      dataType: "brief",
      kind: "final",
      data: { title: "Final" },
    });
    output.apply({
      type: "interrupt",
      requestId: "request-1",
      resumeToken: "resume-1",
      input: {
        kind: "choice",
        multiple: false,
        question: "Approve?",
        options: [{ id: "yes", label: "Yes" }],
      },
    });
    output.apply({
      type: "checkpoint",
      id: "cp-1",
      sessionId: "s-1",
      turnIndex: 3,
    });

    expect(output.message()).toEqual({
      id: "turn-1:assistant",
      role: "assistant",
      content: "Hello",
      checkpointId: "cp-1",
      checkpointTurnIndex: 3,
      contentPieces: [
        { id: "turn-1:text:answer", type: "text", content: "Hello" },
        {
          id: "turn-1:structured:brief",
          type: "structured",
          data: {
            streamId: "brief",
            dataType: "brief",
            status: "done",
            data: { title: "Final" },
          },
        },
        {
          id: "turn-1:interrupt:request-1",
          type: "interrupt",
          requestId: "request-1",
          resumeToken: "resume-1",
          kind: "choice",
          question: "Approve?",
          multiple: false,
          options: [{ id: "yes", label: "Yes" }],
        },
      ],
    });
  });

  it("removes invalidated structured content and retains partial errors", () => {
    const output = createFinalizedChatMessageAccumulator("turn-2");
    output.apply({
      type: "structured-data",
      streamId: "stale",
      dataType: "demo",
      kind: "final",
      data: { title: "old" },
    });
    output.apply({
      type: "structured-data-invalidated",
      streamId: "stale",
      checkpointId: "cp-1",
    });
    output.apply({ type: "message", content: "Partial" });
    output.apply({ type: "error", message: "Failed" });
    expect(output.message()).toMatchObject({
      content: "Partial",
      contentPieces: [
        { type: "text", content: "Partial" },
        { type: "error", content: "Failed" },
      ],
    });
  });
});
