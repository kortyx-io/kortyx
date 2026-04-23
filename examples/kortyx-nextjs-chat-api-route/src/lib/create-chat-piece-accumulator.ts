import type { StructuredStreamItem } from "@kortyx/react";
import type { StreamChunk } from "kortyx/browser";
import type { ContentPiece, HumanInputPiece } from "@/lib/chat-types";

type StructuredStreamsController = {
  applyStreamChunk: (
    chunk: StreamChunk,
  ) => StructuredStreamItem<Record<string, unknown>> | undefined;
};

const isNonEmptyTextPiece = (piece: ContentPiece) =>
  piece.type !== "text" || piece.content.length > 0;

export function createChatPieceAccumulator(args: {
  createId: () => string;
  onChange: (pieces: ContentPiece[]) => void;
  structuredStreams: StructuredStreamsController;
  toHumanInputPiece: (chunk: StreamChunk) => HumanInputPiece;
  openDebugPanel?: () => void;
}) {
  const keyedPieces: Array<{ key: string; piece: ContentPiece }> = [];
  let sawTextDelta = false;

  const emit = () => {
    args.onChange(
      keyedPieces
        .map((entry) => entry.piece)
        .filter((piece) => isNonEmptyTextPiece(piece)),
    );
  };

  const findPieceIndex = (key: string) =>
    keyedPieces.findIndex((entry) => entry.key === key);

  const upsertPiece = (key: string, piece: ContentPiece) => {
    const existingIndex = findPieceIndex(key);
    if (existingIndex >= 0) {
      keyedPieces[existingIndex] = { key, piece };
    } else {
      keyedPieces.push({ key, piece });
    }
    emit();
  };

  const pushPiece = (piece: ContentPiece) => {
    keyedPieces.push({
      key: `${piece.type}:${piece.id}`,
      piece,
    });
    emit();
  };

  const resolveTextStreamKey = (
    chunk: StreamChunk,
    fallbackNode?: string,
  ): string => {
    if ("segmentId" in chunk && typeof chunk.segmentId === "string") {
      const seg = chunk.segmentId.trim();
      if (seg.length > 0) {
        const op =
          "opId" in chunk && typeof chunk.opId === "string"
            ? chunk.opId.trim()
            : "";
        return op.length > 0 ? `${op}:${seg}` : seg;
      }
    }

    if ("opId" in chunk && typeof chunk.opId === "string") {
      const op = chunk.opId.trim();
      if (op.length > 0) {
        const node =
          ("node" in chunk && typeof chunk.node === "string"
            ? chunk.node
            : fallbackNode) ?? "__unknown__";
        return `${op}:${node}`;
      }
    }

    return fallbackNode ?? "__unknown__";
  };

  const ensureTextPiece = (key: string) => {
    const pieceKey = `text:${key || "__unknown__"}`;
    const existingIndex = findPieceIndex(pieceKey);
    if (existingIndex >= 0) {
      return keyedPieces[existingIndex]?.piece as Extract<
        ContentPiece,
        { type: "text" }
      >;
    }

    const nextPiece: Extract<ContentPiece, { type: "text" }> = {
      id: args.createId(),
      type: "text",
      content: "",
    };
    keyedPieces.push({ key: pieceKey, piece: nextPiece });
    return nextPiece;
  };

  const processChunk = (
    chunk: StreamChunk,
    options?: { openDebugOnInterrupt?: boolean | undefined },
  ): boolean => {
    if (chunk.type === "text-start") {
      ensureTextPiece(resolveTextStreamKey(chunk, chunk.node));
      emit();
      return true;
    }

    if (chunk.type === "text-delta") {
      sawTextDelta = true;
      const streamKey = resolveTextStreamKey(chunk, chunk.node);
      const current = ensureTextPiece(streamKey);
      upsertPiece(`text:${streamKey}`, {
        ...current,
        content: current.content + chunk.delta,
      });
      return true;
    }

    if (chunk.type === "text-end") {
      emit();
      return true;
    }

    if (chunk.type === "structured-data") {
      const nextItem = args.structuredStreams.applyStreamChunk(chunk);
      if (nextItem) {
        upsertPiece(`structured:${nextItem.streamId}`, {
          id: nextItem.id,
          type: "structured",
          data: nextItem.state,
        });
      }
      return true;
    }

    if (chunk.type === "interrupt") {
      pushPiece(args.toHumanInputPiece(chunk));
      if (options?.openDebugOnInterrupt) args.openDebugPanel?.();
      return true;
    }

    if (chunk.type === "message") {
      if (!sawTextDelta) {
        pushPiece({
          id: args.createId(),
          type: "text",
          content: chunk.content ?? "",
        });
      }
      return true;
    }

    if (chunk.type === "error") {
      pushPiece({
        id: args.createId(),
        type: "error",
        content: chunk.message ?? "An error occurred",
      });
      return true;
    }

    if (chunk.type === "done") {
      return false;
    }

    return true;
  };

  return {
    processChunk,
    getPieces: () =>
      keyedPieces
        .map((entry) => entry.piece)
        .filter((piece) => isNonEmptyTextPiece(piece)),
  };
}
