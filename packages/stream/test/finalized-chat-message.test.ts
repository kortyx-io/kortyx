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

  it("keeps distinct text streams in arrival order and ignores duplicate message chunks", () => {
    const output = createFinalizedChatMessageAccumulator("turn-3");
    output.apply({ type: "text-start" });
    output.apply({ type: "text-delta", delta: "A" });
    output.apply({ type: "text-delta", opId: "op", delta: "B" });
    output.apply({
      type: "text-delta",
      opId: "op",
      node: "answer",
      delta: "C",
    });
    output.apply({ type: "text-delta", segmentId: "seg", delta: "D" });
    output.apply({
      type: "text-delta",
      opId: "op",
      segmentId: "seg",
      delta: "E",
    });
    output.apply({
      type: "text-delta",
      opId: " ",
      segmentId: " ",
      node: "answer",
      delta: "F",
    });
    output.apply({ type: "message", content: "duplicated" });
    expect(output.message()).toMatchObject({
      content: "ABCDEF",
      contentPieces: [
        { id: "turn-3:text:__unknown__", content: "A" },
        { id: "turn-3:text:op:__unknown__", content: "B" },
        { id: "turn-3:text:op:answer", content: "C" },
        { id: "turn-3:text:seg", content: "D" },
        { id: "turn-3:text:op:seg", content: "E" },
        { id: "turn-3:text:answer", content: "F" },
      ],
    });
  });

  it("drops empty text and ignores invalidation of an absent stream", () => {
    const output = createFinalizedChatMessageAccumulator("turn-4");
    output.apply({ type: "text-start", node: "empty" });
    output.apply({
      type: "structured-data-invalidated",
      streamId: "missing",
      checkpointId: "cp",
    });
    expect(output.message()).toEqual({
      id: "turn-4:assistant",
      role: "assistant",
      content: "",
      contentPieces: [],
    });
  });

  it("preserves optional interrupt contract fields and failure details", () => {
    const output = createFinalizedChatMessageAccumulator("turn-5");
    output.apply({
      type: "interrupt",
      requestId: "custom",
      resumeToken: "resume",
      schemaId: "chunk-schema",
      schemaVersion: "2",
      id: "chunk-id",
      meta: { fromChunk: true, shared: "chunk" },
      input: {
        kind: "custom",
        multiple: false,
        contract: "approval",
        request: { amount: 2 },
        schemaId: "input-schema",
        schemaVersion: "1",
        id: "input-id",
        meta: { fromInput: true, shared: "input" },
      },
    });
    output.apply({
      type: "error",
      message: "Failed",
      failure: {
        version: 1,
        code: "UNKNOWN",
        category: "internal",
        message: "Failed",
        retryable: false,
      },
    });
    expect(output.message().contentPieces).toMatchObject([
      {
        type: "interrupt",
        schemaId: "chunk-schema",
        schemaVersion: "2",
        interruptId: "chunk-id",
        contract: "approval",
        request: { amount: 2 },
        options: [],
        meta: { fromChunk: true, fromInput: true, shared: "chunk" },
      },
      { type: "error", failure: { code: "UNKNOWN", message: "Failed" } },
    ]);
  });

  it("uses interrupt input fields when chunk overrides are absent", () => {
    const output = createFinalizedChatMessageAccumulator("turn-6");
    output.apply({
      type: "interrupt",
      requestId: "choice",
      resumeToken: "resume",
      input: {
        kind: "choice",
        multiple: false,
        question: "Choose",
        options: [{ id: "a", label: "A", description: "First" }],
        schemaId: "input-schema",
        schemaVersion: "1",
        id: "input-id",
        meta: { fromInput: true },
      },
    });
    expect(output.message().contentPieces[0]).toMatchObject({
      schemaId: "input-schema",
      schemaVersion: "1",
      interruptId: "input-id",
      options: [{ id: "a", label: "A", description: "First" }],
      meta: { fromInput: true },
    });
  });

  it("omits optional fields for a plain text interrupt", () => {
    const output = createFinalizedChatMessageAccumulator("turn-7");
    output.apply({
      type: "interrupt",
      requestId: "text",
      resumeToken: "resume",
      meta: { fromChunk: true },
      input: { kind: "text", multiple: false },
    });
    expect(output.message().contentPieces).toEqual([
      {
        id: "turn-7:interrupt:text",
        type: "interrupt",
        requestId: "text",
        resumeToken: "resume",
        kind: "text",
        multiple: false,
        options: [],
        meta: { fromChunk: true },
      },
    ]);
  });
});
