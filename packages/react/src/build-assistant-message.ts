import type { StreamChunk } from "@kortyx/stream/browser";
import type { ChatMsg, ContentPiece } from "./chat-types";

export function buildAssistantMessage(args: {
  createId: () => string;
  pieces: ContentPiece[];
  debug: StreamChunk[];
}): ChatMsg {
  const plainTextContent = args.pieces
    .filter(
      (piece): piece is Extract<ContentPiece, { type: "text" }> =>
        piece.type === "text",
    )
    .map((piece) => piece.content)
    .join("");

  const base = {
    id: args.createId(),
    role: "assistant" as const,
    content: plainTextContent,
    debug: args.debug,
  };

  return args.pieces.length > 0
    ? { ...base, contentPieces: args.pieces }
    : base;
}
