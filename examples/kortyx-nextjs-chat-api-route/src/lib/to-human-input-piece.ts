import type { StreamChunk } from "kortyx/browser";
import type { HumanInputPiece } from "@/lib/chat-types";

interface HumanInputStreamChunk {
  type: "interrupt";
  requestId: string | undefined;
  resumeToken: string | undefined;
  input?: {
    kind?: "text" | "choice" | "multi-choice";
    question?: string;
    multiple?: boolean;
    options?: Array<{
      id?: string | number;
      label?: string;
      description?: string;
    }>;
  };
}

export function toHumanInputPiece(args: {
  chunk: StreamChunk;
  createId: () => string;
}): HumanInputPiece {
  const hi = args.chunk as unknown as HumanInputStreamChunk;
  const input = hi.input ?? {};
  const kind = input.kind || (input.multiple ? "multi-choice" : "choice");
  const isText = kind === "text";

  const question = isText
    ? input.question
    : typeof input.question === "string"
      ? input.question
      : "Please choose";

  const optionsSrc = Array.isArray(input.options) ? input.options : [];
  const optionsArr: Array<{
    id: string;
    label: string;
    description?: string;
  }> = optionsSrc
    .map((option) => ({
      id: String(option.id ?? ""),
      label: String(option.label ?? ""),
      ...(typeof option.description === "string" && option.description
        ? { description: option.description }
        : {}),
    }))
    .filter((option) => option.id && option.label);

  return {
    id: args.createId(),
    type: "interrupt",
    resumeToken: String(hi.resumeToken ?? ""),
    requestId: String(hi.requestId ?? ""),
    kind,
    ...(question !== undefined ? { question } : {}),
    multiple: Boolean(input.multiple),
    options: optionsArr,
  };
}
