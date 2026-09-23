import type {
  FinalizedChatContentPiece,
  StreamChunk,
  StructuredStreamState,
} from "@kortyx/stream/browser";

export type StructuredData = StructuredStreamState<Record<string, unknown>>;

export type ContentPiece = FinalizedChatContentPiece;
export type HumanInputPiece = Extract<ContentPiece, { type: "interrupt" }>;

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  contentPieces?: ContentPiece[];
  debug?: StreamChunk[];
  traceId?: string;
  spanId?: string;
  runId?: string;
  checkpointId?: string;
  checkpointTurnIndex?: number;
  source?:
    | { type: "prompt" }
    | {
        type: "interrupt-response";
        resumeToken: string;
        requestId: string;
        selected: string[];
        text?: string;
        value?: unknown;
      };
};
