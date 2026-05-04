import type { InterruptInput } from "@kortyx/core";
import type { KortyxFinishReason } from "@kortyx/providers";
import type { SchemaLike } from "../types";
import { parseWithSchema } from "../validation";

const tryJsonParse = (
  value: string,
):
  | { ok: true; value: unknown; error?: never }
  | { ok: false; error: string } => {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const extractJsonCodeBlock = (value: string): string | null => {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!match || typeof match[1] !== "string") return null;
  const inner = match[1].trim();
  return inner.length > 0 ? inner : null;
};

const tryStringify = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const resolveOutputCandidate = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const direct = tryJsonParse(trimmed);
  if (direct.ok) return direct.value;

  const block = extractJsonCodeBlock(trimmed);
  if (block) {
    const parsedBlock = tryJsonParse(block);
    if (parsedBlock.ok) return parsedBlock.value;
  }

  return text;
};

const looksLikeStructuredJsonAttempt = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;

  return (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    /^```(?:json)?/i.test(trimmed)
  );
};

const isLikelyTruncatedStructuredOutput = (text: string): boolean => {
  const trimmed = text.trim();
  if (!looksLikeStructuredJsonAttempt(trimmed)) return false;

  const direct = tryJsonParse(trimmed);
  if (!direct.ok && direct.error) return true;

  const block = extractJsonCodeBlock(trimmed);
  if (!block) return false;

  const parsedBlock = tryJsonParse(block);
  return !parsedBlock.ok && Boolean(parsedBlock.error);
};

const createTruncatedStructuredOutputError = (label: string): Error =>
  new Error(
    `${label} was truncated before producing valid structured output. The model stopped due to output length. Increase maxOutputTokens or simplify the requested output.`,
  );

const createInvalidStructuredOutputError = (label: string): Error =>
  new Error(
    `${label} did not produce valid structured output. The model returned text instead of the expected JSON payload. This often happens when output is truncated or the provider does not follow JSON mode. Increase maxOutputTokens or simplify the requested output.`,
  );

export const parseReasonOutputWithSchema = <TOutput>(args: {
  text: string;
  schema: SchemaLike<TOutput>;
  finishReason?: KortyxFinishReason;
  label: string;
}): TOutput => {
  const candidate = resolveOutputCandidate(args.text);

  try {
    return parseWithSchema(args.schema, candidate, args.label);
  } catch (error) {
    if (
      args.finishReason?.unified === "length" ||
      isLikelyTruncatedStructuredOutput(args.text)
    ) {
      throw createTruncatedStructuredOutputError(args.label);
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      throw createInvalidStructuredOutputError(args.label);
    }
    throw error;
  }
};

export const parseInterruptFirstPassResult = <
  TRequest extends InterruptInput = InterruptInput,
  TOutput = unknown,
>(args: {
  text: string;
  requestSchema: SchemaLike<TRequest>;
  outputSchema?: SchemaLike<TOutput>;
  finishReason?: KortyxFinishReason;
  mode?: "required" | "optional" | undefined;
}):
  | {
      draftText: string;
      interruptRequired: boolean;
      request: TRequest;
      output?: TOutput;
    }
  | {
      draftText: string;
      interruptRequired: false;
      request?: undefined;
      output?: TOutput;
    } => {
  const candidate = resolveOutputCandidate(args.text);
  if (!isRecord(candidate)) {
    if (
      args.finishReason?.unified === "length" ||
      isLikelyTruncatedStructuredOutput(args.text)
    ) {
      throw createTruncatedStructuredOutputError("useReason output");
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      throw createInvalidStructuredOutputError("useReason output");
    }
    throw new Error(
      "useReason first pass with interrupt must return a JSON object.",
    );
  }

  const mode = args.mode ?? "required";
  let interruptRequired = true;
  if (mode === "optional") {
    if (
      candidate.decision !== "continue" &&
      candidate.decision !== "interrupt"
    ) {
      throw new Error(
        'useReason optional interrupt first pass must include decision "continue" or "interrupt".',
      );
    }
    interruptRequired = candidate.decision === "interrupt";

    if (!interruptRequired) {
      const hasUnexpectedRequest = [
        candidate.interruptRequest,
        candidate.request,
        candidate.interrupt,
      ].some((value) => value !== null && value !== undefined);

      if (hasUnexpectedRequest) {
        throw new Error(
          'useReason optional interrupt first pass with decision "continue" must not include an interrupt request.',
        );
      }
    }
  }

  let request: TRequest | undefined;
  if (interruptRequired) {
    const requestCandidates: unknown[] = [
      candidate.interruptRequest,
      candidate.request,
      candidate.interrupt,
      mode === "required" ? candidate : undefined,
    ];
    const requestPayload = requestCandidates.find(
      (value) => value !== null && value !== undefined,
    );

    request = parseWithSchema(
      args.requestSchema,
      requestPayload,
      "useReason interrupt.request",
    );
  }

  let output: TOutput | undefined;
  if (args.outputSchema) {
    const outputPayload = Object.hasOwn(candidate, "output")
      ? candidate.output
      : candidate;
    try {
      output = parseWithSchema(
        args.outputSchema,
        outputPayload,
        "useReason output",
      );
    } catch (error) {
      if (
        args.finishReason?.unified === "length" ||
        isLikelyTruncatedStructuredOutput(args.text)
      ) {
        throw createTruncatedStructuredOutputError("useReason output");
      }
      if (
        typeof outputPayload === "string" &&
        outputPayload.trim().length > 0
      ) {
        throw createInvalidStructuredOutputError("useReason output");
      }
      throw error;
    }
  }

  const explicitDraft =
    typeof candidate.draftText === "string" && candidate.draftText.length > 0
      ? candidate.draftText
      : typeof candidate.text === "string" && candidate.text.length > 0
        ? candidate.text
        : undefined;

  if (!args.outputSchema && !explicitDraft) {
    throw new Error(
      "useReason first pass with interrupt requires `draftText` when outputSchema is not provided.",
    );
  }

  const draftText =
    explicitDraft ??
    (output !== undefined ? tryStringify(output) : String(args.text ?? ""));

  if (!interruptRequired) {
    return {
      draftText,
      interruptRequired: false,
      ...(output !== undefined ? { output } : {}),
    };
  }

  return {
    draftText,
    interruptRequired: true,
    request: request as TRequest,
    ...(output !== undefined ? { output } : {}),
  };
};
