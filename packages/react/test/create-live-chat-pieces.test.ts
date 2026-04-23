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
});
