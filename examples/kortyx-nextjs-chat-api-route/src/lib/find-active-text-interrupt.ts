import type { ChatMsg, ContentPiece, HumanInputPiece } from "@kortyx/react";

export function findActiveTextInterrupt(args: {
  messages: ChatMsg[];
  streamContentPieces: ContentPiece[];
}): HumanInputPiece | undefined {
  const liveInterrupt = args.streamContentPieces.find(
    (piece): piece is HumanInputPiece =>
      piece.type === "interrupt" && piece.kind === "text",
  );
  if (liveInterrupt) return liveInterrupt;

  for (let i = args.messages.length - 1; i >= 0; i -= 1) {
    const message = args.messages[i];
    if (!message) continue;
    if (message.role !== "assistant" || !message.contentPieces) continue;

    const messageInterrupt = [...message.contentPieces]
      .reverse()
      .find(
        (piece): piece is HumanInputPiece =>
          piece.type === "interrupt" && piece.kind === "text",
      );
    if (messageInterrupt) return messageInterrupt;
  }

  return undefined;
}
