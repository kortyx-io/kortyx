import {
  createStructuredStreamAccumulator,
  type StreamChunk,
  type StructuredStreamState,
} from "@kortyx/stream/browser";
import { describe, expect, it } from "vitest";
import { createLiveChatPieces } from "../src/create-live-chat-pieces";

type HumanInputPiece = {
  id: string;
  type: "interrupt";
  resumeToken: string;
  requestId: string;
  kind: "text" | "choice" | "multi-choice";
  question?: string;
  multiple: boolean;
  options: Array<{ id: string; label: string; description?: string }>;
};

const createIdFactory = () => {
  let counter = 0;
  return () => `id-${counter++}`;
};

const createHumanInputPiece = (): HumanInputPiece => ({
  id: "interrupt-1",
  type: "interrupt",
  resumeToken: "resume-1",
  requestId: "request-1",
  kind: "text",
  question: "Enter text",
  multiple: false,
  options: [],
});

describe("createLiveChatPieces", () => {
  it("keeps first-seen order when structured chunks arrive after text starts", () => {
    const createId = createIdFactory();
    const snapshots: string[][] = [];
    const structured =
      createStructuredStreamAccumulator<Record<string, unknown>>();
    const structuredPieceIds = new Map<string, string>();

    const accumulator = createLiveChatPieces({
      createId,
      onChange: (pieces) => {
        snapshots.push(
          pieces.map((piece) =>
            piece.type === "structured" ? `structured:${piece.id}` : piece.id,
          ),
        );
      },
      structuredStreams: {
        applyStreamChunk: (chunk) => {
          const state = structured.applyStreamChunk(chunk);
          if (!state) return undefined;

          const existingId = structuredPieceIds.get(state.streamId);
          const id = existingId ?? createId();
          if (!existingId) structuredPieceIds.set(state.streamId, id);

          return {
            id,
            streamId: state.streamId,
            state,
          };
        },
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-start",
      node: "writer",
      opId: "op-1",
      segmentId: "seg-1",
    });
    accumulator.processChunk({
      type: "text-delta",
      delta: "Hello ",
      node: "writer",
      opId: "op-1",
      segmentId: "seg-1",
    });
    accumulator.processChunk({
      type: "structured-data",
      streamId: "stream-1",
      dataType: "demo",
      kind: "set",
      path: "body",
      value: "Draft",
    });
    accumulator.processChunk({
      type: "text-delta",
      delta: "world",
      node: "writer",
      opId: "op-1",
      segmentId: "seg-1",
    });

    const pieces = accumulator.getPieces();

    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({
      id: "id-0",
      type: "text",
      content: "Hello world",
    });
    expect(pieces[1]).toMatchObject({
      id: "id-1",
      type: "structured",
    });
    expect(snapshots.at(-1)).toEqual(["id-0", "structured:id-1"]);
  });

  it("updates a structured stream in place instead of creating a second piece", () => {
    const createId = createIdFactory();
    const structured =
      createStructuredStreamAccumulator<Record<string, unknown>>();
    const structuredPieceIds = new Map<string, string>();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: (chunk) => {
          const state = structured.applyStreamChunk(chunk);
          if (!state) return undefined;

          const existingId = structuredPieceIds.get(state.streamId);
          const id = existingId ?? createId();
          if (!existingId) structuredPieceIds.set(state.streamId, id);

          return {
            id,
            streamId: state.streamId,
            state,
          };
        },
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    const partialChunk: StreamChunk = {
      type: "structured-data",
      streamId: "stream-1",
      dataType: "demo",
      kind: "set",
      path: "body",
      value: "Partial",
    };
    const finalChunk: StreamChunk = {
      type: "structured-data",
      streamId: "stream-1",
      dataType: "demo",
      kind: "final",
      data: {
        body: "Final",
      },
    };

    accumulator.processChunk(partialChunk);
    accumulator.processChunk(finalChunk);

    const pieces = accumulator.getPieces();

    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({
      id: "id-0",
      type: "structured",
      data: {
        streamId: "stream-1",
        status: "done",
        data: {
          body: "Final",
        },
      } satisfies Partial<StructuredStreamState<Record<string, unknown>>>,
    });
  });

  it("does not duplicate message chunks after text deltas have started", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-delta",
      node: "writer",
      delta: "Hello",
    });
    accumulator.processChunk({
      type: "message",
      content: "Hello duplicate",
    });

    expect(accumulator.getPieces()).toEqual([
      {
        id: "id-0",
        type: "text",
        content: "Hello",
      },
    ]);
  });

  it("keeps legacy message chunks when no text delta stream is active", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "message",
      content: "Legacy content",
    });

    expect(accumulator.getPieces()).toEqual([
      {
        id: "id-0",
        type: "text",
        content: "Legacy content",
      },
    ]);
  });

  it("converts interrupt and error chunks into visible live pieces", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "interrupt",
      requestId: "request-1",
      resumeToken: "resume-1",
      input: {
        kind: "text",
        multiple: false,
      },
    });
    accumulator.processChunk({
      type: "error",
      message: "stream failed",
    });

    expect(accumulator.getPieces()).toEqual([
      createHumanInputPiece(),
      {
        id: "id-0",
        type: "error",
        content: "stream failed",
      },
    ]);
  });

  it("emits on text-end chunks without altering the visible pieces", () => {
    const createId = createIdFactory();
    const snapshots: number[] = [];
    const accumulator = createLiveChatPieces({
      createId,
      onChange: (pieces) => snapshots.push(pieces.length),
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-delta",
      delta: "Hi",
      node: "writer",
    });

    const beforeEnd = snapshots.length;

    expect(
      accumulator.processChunk({
        type: "text-end",
        node: "writer",
      }),
    ).toBe(true);

    expect(snapshots.length).toBeGreaterThan(beforeEnd);
    expect(accumulator.getPieces()).toEqual([
      {
        id: "id-0",
        type: "text",
        content: "Hi",
      },
    ]);
  });

  it("returns true for unknown chunk types without adding pieces", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    expect(
      accumulator.processChunk({
        type: "status",
        message: "thinking",
      } as StreamChunk),
    ).toBe(true);
    expect(accumulator.getPieces()).toEqual([]);
  });

  it("groups text streams with opId only and isolates different nodes", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-delta",
      delta: "alpha-",
      node: "writer",
      opId: "op-1",
    });
    accumulator.processChunk({
      type: "text-delta",
      delta: "beta",
      node: "writer",
      opId: "op-1",
    });
    accumulator.processChunk({
      type: "text-delta",
      delta: "other",
      node: "reviewer",
      opId: "op-2",
    });

    const pieces = accumulator.getPieces();
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ content: "alpha-beta" });
    expect(pieces[1]).toMatchObject({ content: "other" });
  });

  it("falls back to fallbackNode when segmentId and opId are missing", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-delta",
      delta: "hi",
    } as StreamChunk);

    expect(accumulator.getPieces()).toEqual([
      {
        id: "id-0",
        type: "text",
        content: "hi",
      },
    ]);
  });

  it("treats blank segmentId/opId as the implicit unknown stream", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-delta",
      delta: "blank-seg-",
      node: "writer",
      opId: "",
      segmentId: "",
    } as StreamChunk);
    accumulator.processChunk({
      type: "text-delta",
      delta: "trailing",
      node: "writer",
      opId: "",
      segmentId: "",
    } as StreamChunk);

    const pieces = accumulator.getPieces();
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({
      content: "blank-seg-trailing",
    });
  });

  it("groups by opId fallback when node is missing", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-delta",
      delta: "left",
      opId: "op-1",
    } as StreamChunk);
    accumulator.processChunk({
      type: "text-delta",
      delta: "-right",
      opId: "op-1",
    } as StreamChunk);

    expect(accumulator.getPieces()).toEqual([
      {
        id: "id-0",
        type: "text",
        content: "left-right",
      },
    ]);
  });

  it("ignores structured chunks that the accumulator does not advance", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    expect(
      accumulator.processChunk({
        type: "structured-data",
        streamId: "noop",
        dataType: "noop",
        kind: "set",
        path: "x",
        value: 1,
      }),
    ).toBe(true);
    expect(accumulator.getPieces()).toEqual([]);
  });

  it("uses an empty string when a legacy message chunk has no content", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "message",
    } as StreamChunk);

    expect(accumulator.getPieces()).toEqual([]);
  });

  it("uses segmentId alone when opId is absent", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-delta",
      delta: "alpha",
      node: "writer",
      segmentId: "seg-x",
    } as StreamChunk);
    accumulator.processChunk({
      type: "text-delta",
      delta: "-beta",
      node: "writer",
      segmentId: "seg-x",
    } as StreamChunk);

    expect(accumulator.getPieces()).toEqual([
      {
        id: "id-0",
        type: "text",
        content: "alpha-beta",
      },
    ]);
  });

  it("treats an empty-string node as the implicit unknown stream", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-delta",
      delta: "a",
      node: "",
    } as StreamChunk);
    accumulator.processChunk({
      type: "text-delta",
      delta: "b",
      node: "",
    } as StreamChunk);

    expect(accumulator.getPieces()).toEqual([
      {
        id: "id-0",
        type: "text",
        content: "ab",
      },
    ]);
  });

  it("falls back to __unknown__ when no segmentId, opId, or node hints exist", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    accumulator.processChunk({
      type: "text-delta",
      delta: "anon",
    } as StreamChunk);

    expect(accumulator.getPieces()).toEqual([
      {
        id: "id-0",
        type: "text",
        content: "anon",
      },
    ]);
  });

  it("uses a fallback error message and stops on done chunks", () => {
    const createId = createIdFactory();
    const accumulator = createLiveChatPieces({
      createId,
      onChange: () => {},
      structuredStreams: {
        applyStreamChunk: () => undefined,
      },
      toHumanInputPiece: () => createHumanInputPiece(),
    });

    expect(
      accumulator.processChunk({
        type: "error",
      } as StreamChunk),
    ).toBe(true);
    expect(
      accumulator.processChunk({
        type: "done",
      }),
    ).toBe(false);
    expect(accumulator.getPieces()).toEqual([
      {
        id: "id-0",
        type: "error",
        content: "An error occurred",
      },
    ]);
  });
});
