import type { InterruptInput, InterruptResult } from "@kortyx/core";
import type {
  KortyxFinishReason,
  KortyxProviderMetadata,
  KortyxUsage,
  KortyxWarning,
} from "@kortyx/providers";
import { getHookContext } from "../context";
import { awaitInterruptInternal } from "../interrupt";
import { emitStructuredData, shouldEmitStructured } from "../structured";
import type { SchemaLike, UseReasonArgs, UseReasonResult } from "../types";
import { parseWithSchema } from "../validation";
import {
  type ReasonInterruptCheckpoint,
  readReasonCheckpoint,
  resolveHookStatePatch,
  resolveReasonCheckpointKey,
} from "./checkpoint";
import { createRuntimeId, reasonEngine } from "./engine";
import {
  parseInterruptFirstPassResult,
  resolveOutputCandidate,
} from "./parsing";
import {
  defaultContinuationInput,
  defaultInterruptFirstPassInput,
  withOutputGuardrails,
  withStructuredStreamHints,
} from "./prompting";
import {
  extractCompletedArrayItems,
  extractCompletedFieldValue,
  extractStreamingStringValue,
  resolveAppendFieldPaths,
  resolveSetFieldPaths,
  resolveTextDeltaFieldPaths,
} from "./structured-stream";

const mergeUsage = (
  left: KortyxUsage | undefined,
  right: KortyxUsage | undefined,
): KortyxUsage | undefined => {
  if (!left) return right;
  if (!right) return left;

  const sum = (
    a: number | undefined,
    b: number | undefined,
  ): number | undefined =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

  const raw =
    left.raw || right.raw
      ? {
          ...(left.raw ?? {}),
          ...(right.raw ?? {}),
        }
      : undefined;
  const input = sum(left.input, right.input);
  const output = sum(left.output, right.output);
  const total = sum(left.total, right.total);
  const reasoning = sum(left.reasoning, right.reasoning);
  const cacheRead = sum(left.cacheRead, right.cacheRead);
  const cacheWrite = sum(left.cacheWrite, right.cacheWrite);
  const merged: KortyxUsage = {};

  if (input !== undefined) merged.input = input;
  if (output !== undefined) merged.output = output;
  if (total !== undefined) merged.total = total;
  if (reasoning !== undefined) merged.reasoning = reasoning;
  if (cacheRead !== undefined) merged.cacheRead = cacheRead;
  if (cacheWrite !== undefined) merged.cacheWrite = cacheWrite;
  if (raw) merged.raw = raw;

  return merged;
};

const mergeWarnings = (
  left: KortyxWarning[] | undefined,
  right: KortyxWarning[] | undefined,
): KortyxWarning[] | undefined => {
  if (!left?.length) return right;
  if (!right?.length) return left;

  const seen = new Set<string>();
  const merged: KortyxWarning[] = [];
  for (const warning of [...left, ...right]) {
    const key = JSON.stringify(warning);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(warning);
  }
  return merged;
};

const mergeProviderMetadata = (
  left: KortyxProviderMetadata | undefined,
  right: KortyxProviderMetadata | undefined,
): KortyxProviderMetadata | undefined => {
  if (!left) return right;
  if (!right) return left;
  return {
    ...left,
    ...right,
  };
};

const emitReasonStructuredOutput = <TOutput>(args: {
  id?: string;
  opId: string;
  output: TOutput;
  structured: UseReasonArgs<TOutput>["structured"];
}): void => {
  if (!shouldEmitStructured(args.structured)) return;

  emitStructuredData<TOutput>({
    dataType: args.structured?.dataType ?? "reason-output",
    data: args.output,
    kind: "final",
    ...(args.structured?.schemaId
      ? { schemaId: args.structured.schemaId }
      : {}),
    ...(args.structured?.schemaVersion
      ? { schemaVersion: args.structured.schemaVersion }
      : {}),
    ...(args.id ? { id: args.id } : {}),
    streamId: args.opId,
  });
};

export async function useReason<
  TOutput = unknown,
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
>(
  args: UseReasonArgs<TOutput, TRequest, TResponse>,
): Promise<UseReasonResult<TOutput, TResponse>> {
  const ctx = getHookContext();
  const id =
    typeof args.id === "string" && args.id.length > 0 ? args.id : undefined;
  const opId = createRuntimeId();
  const checkpointKey = resolveReasonCheckpointKey({
    ...(id ? { id } : {}),
    autoIndex: ctx.reasonCallIndex++,
  });
  const existingCheckpoint = readReasonCheckpoint(
    ctx.currentNodeState.byKey[checkpointKey],
  );

  const reasonMeta =
    typeof id === "string" ? ({ id, opId } as const) : ({ opId } as const);
  const suppressTextStream = Boolean(args.outputSchema || args.interrupt);
  const setFieldPaths = resolveSetFieldPaths(args.structured);
  const appendFieldPaths = resolveAppendFieldPaths(args.structured);
  const textDeltaFieldPaths = resolveTextDeltaFieldPaths(args.structured);
  const useStructuredIncrementalStreaming = Boolean(
    args.outputSchema &&
      !args.interrupt &&
      (setFieldPaths.length > 0 ||
        appendFieldPaths.length > 0 ||
        textDeltaFieldPaths.length > 0) &&
      args.stream !== false &&
      shouldEmitStructured(args.structured),
  );

  let firstText = "";
  let firstRaw: unknown;
  let firstOutput: TOutput | undefined;
  let firstInterruptRequest: TRequest | undefined;

  let finalText = "";
  let finalRaw: unknown;
  let finalOutput: TOutput | undefined;
  let aggregatedUsage: KortyxUsage | undefined;
  let finalFinishReason: KortyxFinishReason | undefined;
  let aggregatedProviderMetadata: KortyxProviderMetadata | undefined;
  let aggregatedWarnings: KortyxWarning[] | undefined;
  const emittedSetValues = new Map<string, string>();
  const emittedAppendCounts = new Map<string, number>();
  const emittedTextValues = new Map<string, string>();

  if (existingCheckpoint) {
    firstText = existingCheckpoint.firstText;
    firstRaw = existingCheckpoint.firstRaw;
    firstOutput = existingCheckpoint.firstOutput as TOutput | undefined;
    finalText = firstText;
    finalRaw = firstRaw;
    finalOutput = firstOutput;
    aggregatedUsage = existingCheckpoint.firstUsage;
    finalFinishReason = existingCheckpoint.firstFinishReason;
    aggregatedProviderMetadata = existingCheckpoint.firstProviderMetadata;
    aggregatedWarnings = existingCheckpoint.firstWarnings;
  } else {
    const first = await reasonEngine(
      {
        ...args,
        emit: suppressTextStream ? false : args.emit,
        stream: useStructuredIncrementalStreaming
          ? true
          : suppressTextStream
            ? false
            : args.stream,
        ...(useStructuredIncrementalStreaming
          ? {
              onTextChunk: (delta: string) => {
                firstText += delta;
                finalText = firstText;

                for (const path of setFieldPaths) {
                  const current = extractCompletedFieldValue({
                    text: firstText,
                    path,
                  });
                  if (!current.found || !current.complete) continue;

                  const nextSerialized = JSON.stringify(current.value);
                  if (emittedSetValues.get(path) === nextSerialized) continue;

                  emittedSetValues.set(path, nextSerialized);
                  emitStructuredData({
                    kind: "set",
                    path,
                    value: current.value,
                    dataType: args.structured?.dataType ?? "reason-output",
                    ...(args.structured?.schemaId
                      ? { schemaId: args.structured.schemaId }
                      : {}),
                    ...(args.structured?.schemaVersion
                      ? { schemaVersion: args.structured.schemaVersion }
                      : {}),
                    ...(id ? { id } : {}),
                    streamId: opId,
                  });
                }

                for (const path of appendFieldPaths) {
                  const items = extractCompletedArrayItems({
                    text: firstText,
                    path,
                  });
                  const emittedAppendCount = emittedAppendCounts.get(path) ?? 0;
                  if (items.length <= emittedAppendCount) continue;

                  const nextItems = items.slice(emittedAppendCount);
                  emittedAppendCounts.set(path, items.length);
                  emitStructuredData({
                    kind: "append",
                    path,
                    items: nextItems,
                    dataType: args.structured?.dataType ?? "reason-output",
                    ...(args.structured?.schemaId
                      ? { schemaId: args.structured.schemaId }
                      : {}),
                    ...(args.structured?.schemaVersion
                      ? { schemaVersion: args.structured.schemaVersion }
                      : {}),
                    ...(id ? { id } : {}),
                    streamId: opId,
                  });
                }

                for (const path of textDeltaFieldPaths) {
                  const current = extractStreamingStringValue({
                    text: firstText,
                    path,
                  });
                  const emittedTextValue = emittedTextValues.get(path) ?? "";
                  if (
                    !current.found ||
                    current.value.length <= emittedTextValue.length ||
                    !current.value.startsWith(emittedTextValue)
                  ) {
                    continue;
                  }

                  const nextDelta = current.value.slice(
                    emittedTextValue.length,
                  );
                  emittedTextValues.set(path, current.value);
                  if (nextDelta.length === 0) continue;

                  emitStructuredData({
                    kind: "text-delta",
                    path,
                    delta: nextDelta,
                    dataType: args.structured?.dataType ?? "reason-output",
                    ...(args.structured?.schemaId
                      ? { schemaId: args.structured.schemaId }
                      : {}),
                    ...(args.structured?.schemaVersion
                      ? { schemaVersion: args.structured.schemaVersion }
                      : {}),
                    ...(id ? { id } : {}),
                    streamId: opId,
                  });
                }
              },
            }
          : {}),
      },
      reasonMeta,
      args.interrupt
        ? defaultInterruptFirstPassInput({
            input: args.input,
            requestSchema: args.interrupt.requestSchema,
            ...(args.outputSchema
              ? { outputSchema: args.outputSchema as SchemaLike<unknown> }
              : {}),
          })
        : args.outputSchema
          ? withOutputGuardrails(
              withStructuredStreamHints(args.input, {
                ...(setFieldPaths.length > 0 ? { setFieldPaths } : {}),
                ...(appendFieldPaths.length > 0 ? { appendFieldPaths } : {}),
                ...(textDeltaFieldPaths.length > 0
                  ? { textDeltaFieldPaths }
                  : {}),
              }),
              args.outputSchema as SchemaLike<unknown>,
            )
          : undefined,
    );
    firstRaw = first.raw;
    finalRaw = first.raw;
    aggregatedUsage = mergeUsage(aggregatedUsage, first.usage);
    finalFinishReason = first.finishReason;
    aggregatedProviderMetadata = mergeProviderMetadata(
      aggregatedProviderMetadata,
      first.providerMetadata,
    );
    aggregatedWarnings = mergeWarnings(aggregatedWarnings, first.warnings);

    if (args.interrupt) {
      const firstPass = parseInterruptFirstPassResult<TRequest, TOutput>({
        text: first.text,
        requestSchema: args.interrupt.requestSchema,
        ...(args.outputSchema
          ? { outputSchema: args.outputSchema as SchemaLike<TOutput> }
          : {}),
      });
      firstText = firstPass.draftText;
      finalText = firstPass.draftText;
      firstInterruptRequest = firstPass.request;
      firstOutput = firstPass.output;
      finalOutput = firstPass.output;
    } else {
      firstText = first.text;
      finalText = first.text;
      if (args.outputSchema) {
        firstOutput = parseWithSchema(
          args.outputSchema,
          resolveOutputCandidate(first.text),
          "useReason output",
        );
      }
      finalOutput = firstOutput;
    }
  }

  let interruptResponse: TResponse | undefined;

  if (args.interrupt) {
    const requestSchema = args.interrupt.requestSchema;

    const interruptRequest = existingCheckpoint
      ? parseWithSchema(
          requestSchema,
          existingCheckpoint.request,
          "useReason interrupt.request",
        )
      : firstInterruptRequest;

    if (!interruptRequest) {
      throw new Error(
        "useReason interrupt request is missing; first pass did not produce a valid interrupt payload.",
      );
    }

    if (!existingCheckpoint) {
      ctx.currentNodeState.byKey[checkpointKey] = {
        status: "awaiting_interrupt",
        request: interruptRequest,
        firstText,
        ...(firstRaw !== undefined ? { firstRaw } : {}),
        ...(aggregatedUsage !== undefined
          ? { firstUsage: aggregatedUsage }
          : {}),
        ...(finalFinishReason !== undefined
          ? { firstFinishReason: finalFinishReason }
          : {}),
        ...(aggregatedProviderMetadata !== undefined
          ? { firstProviderMetadata: aggregatedProviderMetadata }
          : {}),
        ...(aggregatedWarnings !== undefined
          ? { firstWarnings: aggregatedWarnings }
          : {}),
        ...(firstOutput !== undefined ? { firstOutput } : {}),
      } satisfies ReasonInterruptCheckpoint;
      ctx.dirty = true;
    }

    const resumeStatePatch = resolveHookStatePatch({
      nodeId: ctx.node.graph.node,
      currentNodeState: ctx.currentNodeState,
      workflowState: ctx.workflowState,
    });

    interruptResponse = await awaitInterruptInternal<TRequest, TResponse>({
      request: interruptRequest,
      requestSchema,
      responseSchema: args.interrupt.responseSchema,
      ...(args.interrupt.schemaId ? { schemaId: args.interrupt.schemaId } : {}),
      ...(args.interrupt.schemaVersion
        ? { schemaVersion: args.interrupt.schemaVersion }
        : {}),
      ...(id ? { id } : {}),
      meta: {
        __kortyxResumeStatePatch: resumeStatePatch,
      },
    });

    if (Object.hasOwn(ctx.currentNodeState.byKey, checkpointKey)) {
      delete ctx.currentNodeState.byKey[checkpointKey];
      ctx.dirty = true;
    }

    const continuationInput = defaultContinuationInput({
      input: args.input,
      draftText: firstText,
      ...(firstOutput !== undefined ? { draftOutput: firstOutput } : {}),
      request: interruptRequest,
      response: interruptResponse,
    });

    const second = await reasonEngine(
      {
        ...args,
        emit: suppressTextStream ? false : args.emit,
        stream: suppressTextStream ? false : args.stream,
      },
      reasonMeta,
      args.outputSchema
        ? withOutputGuardrails(
            continuationInput,
            args.outputSchema as SchemaLike<unknown>,
          )
        : continuationInput,
    );
    finalText = second.text;
    finalRaw = second.raw;
    aggregatedUsage = mergeUsage(aggregatedUsage, second.usage);
    finalFinishReason = second.finishReason;
    aggregatedProviderMetadata = mergeProviderMetadata(
      aggregatedProviderMetadata,
      second.providerMetadata,
    );
    aggregatedWarnings = mergeWarnings(aggregatedWarnings, second.warnings);

    if (args.outputSchema) {
      finalOutput = parseWithSchema(
        args.outputSchema,
        resolveOutputCandidate(finalText),
        "useReason output",
      );
    }
  }

  if (finalOutput !== undefined) {
    emitReasonStructuredOutput<TOutput>({
      ...(id ? { id } : {}),
      opId,
      output: finalOutput,
      structured: args.structured,
    });
  }

  return {
    ...(id ? { id } : {}),
    opId,
    text: finalText,
    ...(finalRaw !== undefined ? { raw: finalRaw } : {}),
    ...(aggregatedUsage !== undefined ? { usage: aggregatedUsage } : {}),
    ...(finalFinishReason !== undefined
      ? { finishReason: finalFinishReason }
      : {}),
    ...(aggregatedProviderMetadata !== undefined
      ? { providerMetadata: aggregatedProviderMetadata }
      : {}),
    ...(aggregatedWarnings !== undefined
      ? { warnings: aggregatedWarnings }
      : {}),
    ...(finalOutput !== undefined ? { output: finalOutput } : {}),
    ...(interruptResponse !== undefined ? { interruptResponse } : {}),
  };
}
