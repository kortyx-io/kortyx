import type {
  StreamChunk,
  StructuredStreamState,
} from "@kortyx/stream/browser";

export type StructuredData = StructuredStreamState<Record<string, unknown>>;

export type HumanInputPiece = {
  id: string;
  type: "interrupt";
  resumeToken: string;
  requestId: string;
  kind: "text" | "choice" | "multi-choice";
  question?: string;
  multiple: boolean;
  options: Array<{ id: string; label: string; description?: string }>;
};

export type ContentPiece =
  | { id: string; type: "text"; content: string }
  | { id: string; type: "structured"; data: StructuredData }
  | { id: string; type: "error"; content: string }
  | HumanInputPiece;

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  contentPieces?: ContentPiece[];
  debug?: StreamChunk[];
};
