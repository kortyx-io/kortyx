import type { InterruptInput, InterruptResult } from "@kortyx/core";
import type {
  KortyxFinishReason,
  KortyxProviderMetadata,
  KortyxUsage,
  KortyxWarning,
} from "@kortyx/providers";
import {
  accumulateTokenUsage,
  getHookContext,
  getReasonTraceAdapter,
} from "../context";
import { awaitInterruptInternal } from "../interrupt";
import {
  emitStructuredData,
  shouldEmitStructured,
  shouldStreamStructured,
} from "../structured";
import type { ReasonTraceSpan } from "../tracing";
import type { SchemaLike, UseReasonArgs, UseReasonResult } from "../types";
import { parseWithSchema } from "../validation";
import {
  type ReasonInterruptCheckpoint,
  readReasonCheckpoint,
  readReasonCompletedCheckpoint,
  resolveHookStatePatch,
  resolveReasonCheckpointKey,
} from "./checkpoint";
import { createRuntimeId, reasonEngine } from "./engine";
import {
  parseInterruptFirstPassResult,
  parseReasonOutputWithSchema,
} from "./parsing";
import {
  defaultContinuationInput,
  defaultInterruptFirstPassInput,
  withOutputGuardrails,
  withStructuredStreamHints,
} from "./prompting";
import {
  extractCompletedArrayItemGroups,
  extractCompletedFieldValues,
  extractStreamingStringValues,
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
  emit: boolean;
}): void => {
  if (!args.emit || !shouldEmitStructured(args.structured)) return;

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

const shouldStreamReasonStructured = <
  TOutput,
  TRequest extends InterruptInput,
  TResponse,
>(
  args: UseReasonArgs<TOutput, TRequest, TResponse>,
): boolean => (args.emit ?? true) && shouldStreamStructured(args.structured);

const resolveEffectiveReasoningIncludeThoughts = <
  TOutput,
  TRequest extends InterruptInput,
  TResponse,
>(
  args: UseReasonArgs<TOutput, TRequest, TResponse>,
): boolean =>
  args.reasoning?.includeThoughts ??
  args.model.options?.reasoning?.includeThoughts ??
  false;

const resolveEffectiveResponseFormatType = <
  TOutput,
  TRequest extends InterruptInput,
  TResponse,
>(
  args: UseReasonArgs<TOutput, TRequest, TResponse>,
): "text" | "json" | undefined =>
  args.responseFormat?.type ?? args.model.options?.responseFormat?.type;

const assertReasoningThoughtsCompatibility = <
  TOutput,
  TRequest extends InterruptInput,
  TResponse,
>(
  args: UseReasonArgs<TOutput, TRequest, TResponse>,
): void => {
  if (!resolveEffectiveReasoningIncludeThoughts(args)) return;

  const usesStructuredOutput =
    Boolean(args.outputSchema) ||
    Boolean(args.interrupt) ||
    Boolean(args.structured) ||
    resolveEffectiveResponseFormatType(args) === "json";

  if (!usesStructuredOutput) return;

  throw new Error(
    "useReason does not support reasoning.includeThoughts with structured output, interrupt mode, or JSON responseFormat. Disable includeThoughts for this call.",
  );
};

export async function useReason<
  TOutput = unknown,
  TRequest extends InterruptInput = InterruptInput,
  TResponse = InterruptResult,
>(
  args: UseReasonArgs<TOutput, TRequest, TResponse>,
): Promise<UseReasonResult<TOutput, TResponse>> {
  assertReasoningThoughtsCompatibility(args);
  const ctx = getHookContext();
  const id =
    typeof args.id === "string" && args.id.length > 0 ? args.id : undefined;
  const opId = createRuntimeId();
  const checkpointKey = resolveReasonCheckpointKey({
    ...(id ? { id } : {}),
    autoIndex: ctx.reasonCallIndex++,
  });
  const existingCompleted = readReasonCompletedCheckpoint(
    ctx.currentNodeState.byKey[checkpointKey],
  );

  if (existingCompleted) {
    return existingCompleted.result as UseReasonResult<TOutput, TResponse>;
  }

  const existingCheckpoint = readReasonCheckpoint(
    ctx.currentNodeState.byKey[checkpointKey],
  );

  const reasonMeta =
    typeof id === "string" ? ({ id, opId } as const) : ({ opId } as const);
  const traceSpan: ReasonTraceSpan | undefined =
    getReasonTraceAdapter()?.startSpan({
      name: "useReason",
      attributes: {
        ...(id ? { id } : {}),
        opId,
        nodeId: ctx.node.graph.node,
        providerId: args.model.provider.id,
        modelId: args.model.modelId,
        stream: args.stream ?? args.model.options?.streaming ?? true,
        emit: args.emit ?? true,
        ...(args.telemetry?.operation
          ? { operation: args.telemetry.operation }
          : {}),
        ...(args.telemetry?.prompt?.name
          ? { promptName: args.telemetry.prompt.name }
          : {}),
        ...(args.telemetry?.prompt?.version !== undefined
          ? { promptVersion: args.telemetry.prompt.version }
          : {}),
        ...(args.telemetry?.prompt?.type
          ? { promptType: args.telemetry.prompt.type }
          : {}),
        hasOutputSchema: Boolean(args.outputSchema),
        hasInterrupt: Boolean(args.interrupt),
        hasStructured: Boolean(args.structured),
      },
      telemetry: {
        ...(args.telemetry ?? {}),
        input: args.telemetry?.input ?? args.input,
      },
    });
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
      shouldStreamReasonStructured(args),
  );

  let firstText = "";
  let firstRaw: unknown;
  let firstOutput: TOutput | undefined;
  let firstInterruptRequest: TRequest | undefined;
  let firstInterruptRequired = false;

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
    traceSpan?.addEvent?.("useReason.resume", {
      checkpointKey,
    });
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

                for (const fieldPath of setFieldPaths) {
                  const values = extractCompletedFieldValues({
                    text: firstText,
                    path: fieldPath,
                  });

                  for (const { path, value } of values) {
                    const nextSerialized = JSON.stringify(value);
                    if (emittedSetValues.get(path) === nextSerialized) continue;

                    emittedSetValues.set(path, nextSerialized);
                    emitStructuredData({
                      kind: "set",
                      path,
                      value,
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
                }

                for (const fieldPath of appendFieldPaths) {
                  const groups = extractCompletedArrayItemGroups({
                    text: firstText,
                    path: fieldPath,
                  });

                  for (const { path, items } of groups) {
                    const emittedAppendCount =
                      emittedAppendCounts.get(path) ?? 0;
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
                }

                for (const fieldPath of textDeltaFieldPaths) {
                  const values = extractStreamingStringValues({
                    text: firstText,
                    path: fieldPath,
                  });

                  for (const { path, value } of values) {
                    const emittedTextValue = emittedTextValues.get(path) ?? "";
                    if (
                      value.length <= emittedTextValue.length ||
                      !value.startsWith(emittedTextValue)
                    ) {
                      continue;
                    }

                    const nextDelta = value.slice(emittedTextValue.length);
                    emittedTextValues.set(path, value);
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
            mode: args.interrupt.mode ?? "required",
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
    accumulateTokenUsage(first.usage);
    aggregatedUsage = mergeUsage(aggregatedUsage, first.usage);
    finalFinishReason = first.finishReason;
    aggregatedProviderMetadata = mergeProviderMetadata(
      aggregatedProviderMetadata,
      first.providerMetadata,
    );
    aggregatedWarnings = mergeWarnings(aggregatedWarnings, first.warnings);
    traceSpan?.addEvent?.("useReason.first-pass.complete", {
      textLength: first.text.length,
      hasInterrupt: Boolean(args.interrupt),
    });

    if (args.interrupt) {
      const firstPass = parseInterruptFirstPassResult<TRequest, TOutput>({
        text: first.text,
        requestSchema: args.interrupt.requestSchema,
        ...(first.finishReason ? { finishReason: first.finishReason } : {}),
        ...(args.outputSchema
          ? { outputSchema: args.outputSchema as SchemaLike<TOutput> }
          : {}),
        mode: args.interrupt.mode ?? "required",
      });
      firstText = firstPass.draftText;
      finalText = firstPass.draftText;
      firstInterruptRequired = firstPass.interruptRequired;
      firstInterruptRequest = firstPass.request;
      firstOutput = firstPass.output;
      finalOutput = firstPass.output;
    } else {
      firstText = first.text;
      finalText = first.text;
      if (args.outputSchema) {
        firstOutput = parseReasonOutputWithSchema({
          text: first.text,
          schema: args.outputSchema,
          ...(first.finishReason ? { finishReason: first.finishReason } : {}),
          label: "useReason output",
        });
      }
      finalOutput = firstOutput;
    }
  }

  let interruptResponse: TResponse | undefined;

  if (args.interrupt && (existingCheckpoint || firstInterruptRequired)) {
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
      ctx.stateDirty = true;
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
    traceSpan?.addEvent?.("useReason.interrupt.resolved", {
      checkpointKey,
    });

    if (Object.hasOwn(ctx.currentNodeState.byKey, checkpointKey)) {
      delete ctx.currentNodeState.byKey[checkpointKey];
      ctx.stateDirty = true;
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
    accumulateTokenUsage(second.usage);
    aggregatedUsage = mergeUsage(aggregatedUsage, second.usage);
    finalFinishReason = second.finishReason;
    aggregatedProviderMetadata = mergeProviderMetadata(
      aggregatedProviderMetadata,
      second.providerMetadata,
    );
    aggregatedWarnings = mergeWarnings(aggregatedWarnings, second.warnings);
    traceSpan?.addEvent?.("useReason.continuation.complete", {
      textLength: second.text.length,
    });

    if (args.outputSchema) {
      finalOutput = parseReasonOutputWithSchema({
        text: finalText,
        schema: args.outputSchema,
        ...(second.finishReason ? { finishReason: second.finishReason } : {}),
        label: "useReason output",
      });
    }
  }

  if (finalOutput !== undefined) {
    emitReasonStructuredOutput<TOutput>({
      ...(id ? { id } : {}),
      opId,
      output: finalOutput,
      structured: args.structured,
      emit: args.emit ?? true,
    });
  }

  const result = {
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

  if (args.interrupt) {
    ctx.currentNodeState.byKey[checkpointKey] = {
      status: "completed",
      result,
    };
    ctx.stateDirty = true;
  }

  traceSpan?.end?.({
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
    attributes: {
      textLength: finalText.length,
      resumedFromCheckpoint: Boolean(existingCheckpoint),
      interrupted: Boolean(interruptResponse !== undefined),
    },
    telemetry: {
      ...(args.telemetry ?? {}),
      output: args.telemetry?.output ?? finalOutput ?? finalText,
    },
  });

  return result;
}
