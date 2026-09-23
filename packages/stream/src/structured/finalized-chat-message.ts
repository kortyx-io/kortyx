import type { FailureDescriptor } from "@kortyx/core/errors";
import type { StreamChunk } from "../types/stream-chunk";
import type { StructuredStreamState } from "./apply-structured-chunk";
import { createStructuredStreamAccumulator } from "./structured-stream-accumulator";

export type FinalizedChatContentPiece =
  | { id: string; type: "text"; content: string }
  | {
      id: string;
      type: "structured";
      data: StructuredStreamState<Record<string, unknown>>;
    }
  | { id: string; type: "error"; content: string; failure?: FailureDescriptor }
  | {
      id: string;
      type: "interrupt";
      resumeToken: string;
      requestId: string;
      kind: "text" | "choice" | "multi-choice" | "custom";
      question?: string;
      multiple: boolean;
      options: Array<{ id: string; label: string; description?: string }>;
      schemaId?: string;
      schemaVersion?: string;
      contract?: string;
      request?: unknown;
      interruptId?: string;
      meta?: Record<string, unknown>;
    };

export type FinalizedChatMessage = {
  id: string;
  role: "assistant";
  content: string;
  contentPieces: FinalizedChatContentPiece[];
  checkpointId?: string;
  checkpointTurnIndex?: number;
};

type TextChunk = Extract<
  StreamChunk,
  { type: "text-start" | "text-delta" | "text-end" }
>;
type InterruptChunk = Extract<StreamChunk, { type: "interrupt" }>;

const textStreamKey = (chunk: TextChunk): string => {
  const op = chunk.opId?.trim();
  const segment = chunk.segmentId?.trim();
  if (segment) return op ? `${op}:${segment}` : segment;
  if (op) return `${op}:${chunk.node ?? "__unknown__"}`;
  return chunk.node ?? "__unknown__";
};

/** Shared default interrupt projection for server snapshots and React. */
export function projectInterruptPiece(
  chunk: InterruptChunk,
  id: string,
): Extract<FinalizedChatContentPiece, { type: "interrupt" }> {
  const input = chunk.input;
  const schemaId = chunk.schemaId ?? input.schemaId;
  const schemaVersion = chunk.schemaVersion ?? input.schemaVersion;
  const interruptId = chunk.id ?? input.id;
  return {
    id,
    type: "interrupt",
    resumeToken: chunk.resumeToken,
    requestId: chunk.requestId,
    kind: input.kind,
    ...(input.question !== undefined ? { question: input.question } : {}),
    multiple: input.multiple,
    options: (input.options ?? []).map((option) => ({
      id: option.id,
      label: option.label,
      ...(option.description ? { description: option.description } : {}),
    })),
    ...(schemaId ? { schemaId } : {}),
    ...(schemaVersion ? { schemaVersion } : {}),
    ...(input.kind === "custom" && input.contract
      ? { contract: input.contract }
      : {}),
    ...(input.kind === "custom" ? { request: input.request } : {}),
    ...(interruptId ? { interruptId } : {}),
    ...(input.meta || chunk.meta
      ? { meta: { ...(input.meta ?? {}), ...(chunk.meta ?? {}) } }
      : {}),
  };
}

/** Accumulates emitted UI chunks without consuming the HTTP response. */
export function createFinalizedChatMessageAccumulator(clientTurnId: string) {
  const pieces: FinalizedChatContentPiece[] = [];
  const textIndexes = new Map<string, number>();
  const structured =
    createStructuredStreamAccumulator<Record<string, unknown>>();
  let sawTextDelta = false;
  let checkpoint: { id: string; turnIndex: number } | undefined;

  const ensureText = (key: string) => {
    const existing = textIndexes.get(key);
    if (existing !== undefined) return existing;
    const index = pieces.length;
    pieces.push({
      id: `${clientTurnId}:text:${key}`,
      type: "text",
      content: "",
    });
    textIndexes.set(key, index);
    return index;
  };

  return {
    apply(chunk: StreamChunk): void {
      switch (chunk.type) {
        case "checkpoint":
          checkpoint = { id: chunk.id, turnIndex: chunk.turnIndex };
          break;
        case "text-start":
          ensureText(textStreamKey(chunk));
          break;
        case "text-delta": {
          sawTextDelta = true;
          const index = ensureText(textStreamKey(chunk));
          const current = pieces[index] as Extract<
            FinalizedChatContentPiece,
            { type: "text" }
          >;
          pieces[index] = {
            ...current,
            content: current.content + chunk.delta,
          };
          break;
        }
        case "message":
          if (!sawTextDelta) {
            pieces.push({
              id: `${clientTurnId}:message:${pieces.length}`,
              type: "text",
              content: chunk.content,
            });
          }
          break;
        case "structured-data": {
          const data = structured.apply(chunk);
          const id = `${clientTurnId}:structured:${chunk.streamId}`;
          const index = pieces.findIndex((piece) => piece.id === id);
          const piece = { id, type: "structured", data } as const;
          if (index < 0) pieces.push(piece);
          else pieces[index] = piece;
          break;
        }
        case "structured-data-invalidated": {
          structured.delete(chunk.streamId);
          const index = pieces.findIndex(
            (piece) =>
              piece.id === `${clientTurnId}:structured:${chunk.streamId}`,
          );
          if (index >= 0) pieces.splice(index, 1);
          break;
        }
        case "interrupt":
          pieces.push(
            projectInterruptPiece(
              chunk,
              `${clientTurnId}:interrupt:${chunk.requestId}`,
            ),
          );
          break;
        case "error":
          pieces.push({
            id: `${clientTurnId}:error:${pieces.length}`,
            type: "error",
            content: chunk.message,
            ...(chunk.failure ? { failure: chunk.failure } : {}),
          });
          break;
      }
    },
    message(): FinalizedChatMessage {
      const contentPieces = pieces.filter(
        (piece) => piece.type !== "text" || piece.content.length > 0,
      );
      return {
        id: `${clientTurnId}:assistant`,
        role: "assistant",
        content: contentPieces
          .filter(
            (
              piece,
            ): piece is Extract<FinalizedChatContentPiece, { type: "text" }> =>
              piece.type === "text",
          )
          .map((piece) => piece.content)
          .join(""),
        contentPieces: contentPieces.map((piece) => ({ ...piece })),
        ...(checkpoint
          ? {
              checkpointId: checkpoint.id,
              checkpointTurnIndex: checkpoint.turnIndex,
            }
          : {}),
      };
    },
  };
}
