import type { InterruptInput } from "@kortyx/core";
import { ValidationError } from "@kortyx/core/errors";
import type { KortyxFinishReason, KortyxUsage } from "@kortyx/providers";
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

const createTruncatedStructuredOutputError = (
  label: string,
  cause?: unknown,
): Error =>
  new ValidationError(
    "OUTPUT_TRUNCATED",
    `${label} was truncated before producing valid structured output. The model stopped due to output length. Increase maxOutputTokens or simplify the requested output.`,
    cause,
  );

const createInvalidStructuredOutputError = (
  label: string,
  cause?: unknown,
): Error =>
  new ValidationError(
    "INVALID_MODEL_JSON",
    `${label} did not produce valid structured output. The model returned text instead of the expected JSON payload. Check outputSchema and provider structured-output settings.`,
    cause,
  );

export const parseReasonOutputWithSchema = <TOutput>(args: {
  text: string;
  schema: SchemaLike<TOutput>;
  finishReason?: KortyxFinishReason;
  usage?: KortyxUsage;
  label: string;
}): TOutput => {
  const candidate = resolveOutputCandidate(args.text);
  const block = extractJsonCodeBlock(args.text.trim());
  const validJson =
    tryJsonParse(args.text.trim()).ok ||
    (block !== null && tryJsonParse(block).ok);

  try {
    return parseWithSchema(args.schema, candidate, args.label);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    const failure =
      args.finishReason?.unified === "length"
        ? createTruncatedStructuredOutputError(args.label, error)
        : typeof candidate === "string" && !validJson
          ? createInvalidStructuredOutputError(args.label, error)
          : error;
    if (failure && typeof failure === "object")
      Object.assign(failure, {
        ...(args.usage ? { usage: args.usage } : {}),
        ...(args.finishReason ? { finishReason: args.finishReason } : {}),
      });
    throw failure;
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
  usage?: KortyxUsage;
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
  try {
    const candidate = resolveOutputCandidate(args.text);
    if (!isRecord(candidate)) {
      if (args.finishReason?.unified === "length") {
        throw createTruncatedStructuredOutputError("useReason output");
      }
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        throw createInvalidStructuredOutputError("useReason output");
      }
      throw new ValidationError(
        "MODEL_OUTPUT_SCHEMA",
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
        throw new ValidationError(
          "MODEL_OUTPUT_SCHEMA",
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
          throw new ValidationError(
            "MODEL_OUTPUT_SCHEMA",
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
        if (!(error instanceof ValidationError)) throw error;
        if (args.finishReason?.unified === "length") {
          throw createTruncatedStructuredOutputError("useReason output", error);
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
      throw new ValidationError(
        "MODEL_OUTPUT_SCHEMA",
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
  } catch (error) {
    if (error && typeof error === "object")
      Object.assign(error, {
        ...(args.usage ? { usage: args.usage } : {}),
        ...(args.finishReason ? { finishReason: args.finishReason } : {}),
      });
    throw error;
  }
};
