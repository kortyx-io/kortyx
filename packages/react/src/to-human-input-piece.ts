import type { StreamChunk } from "@kortyx/stream/browser";
import type { HumanInputPiece } from "./chat-types";

interface HumanInputStreamChunk {
  type: "interrupt";
  requestId: string | undefined;
  resumeToken: string | undefined;
  id?: string;
  schemaId?: string;
  schemaVersion?: string;
  meta?: Record<string, unknown>;
  input?: {
    kind?: "text" | "choice" | "multi-choice";
    question?: string;
    multiple?: boolean;
    id?: string;
    schemaId?: string;
    schemaVersion?: string;
    meta?: Record<string, unknown>;
    options?: Array<{
      id?: string | number;
      label?: string;
      description?: string;
    }>;
  };
}

export type ToHumanInputPiece = (args: {
  chunk: StreamChunk;
  createId: () => string;
}) => HumanInputPiece;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const firstNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const result = nonEmptyString(value);
    if (result) return result;
  }
  return undefined;
};

export function toHumanInputPiece(args: {
  chunk: StreamChunk;
  createId: () => string;
}): HumanInputPiece {
  const hi = args.chunk as unknown as HumanInputStreamChunk;
  const input = hi.input ?? {};
  const kind = input.kind || (input.multiple ? "multi-choice" : "choice");
  const isText = kind === "text";
  const schemaId = firstNonEmptyString(hi.schemaId, input.schemaId);
  const schemaVersion = firstNonEmptyString(
    hi.schemaVersion,
    input.schemaVersion,
  );
  const interruptId = firstNonEmptyString(hi.id, input.id);
  const inputMeta = isRecord(input.meta) ? input.meta : undefined;
  const chunkMeta = isRecord(hi.meta) ? hi.meta : undefined;
  const meta =
    inputMeta || chunkMeta
      ? { ...(inputMeta ?? {}), ...(chunkMeta ?? {}) }
      : undefined;

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
    ...(schemaId ? { schemaId } : {}),
    ...(schemaVersion ? { schemaVersion } : {}),
    ...(interruptId ? { interruptId } : {}),
    ...(meta ? { meta } : {}),
  };
}
