import type { InterruptInput, InterruptResult } from "@kortyx/core";
import {
  combineAbortSignals,
  isExecutionCancelled,
  isExecutionLimitReached,
  throwIfExecutionAborted,
} from "@kortyx/core";
import type {
  KortyxExecutableTool,
  KortyxFinishReason,
  KortyxPromptMessage,
  KortyxProviderMetadata,
  KortyxToolCall,
  KortyxToolDefinition,
  KortyxToolResult,
  KortyxUsage,
  KortyxWarning,
} from "@kortyx/providers";
import { accumulateTokenUsage, getHookContext } from "../context";
import { awaitInterruptInternal } from "../interrupt";
import {
  type RunReasonEngineResult,
  resolveProviderOptions,
} from "../reason-engine";
import { shouldStreamStructured } from "../structured";
import type { ReasonTraceSpan } from "../tracing";
import type { UseReasonArgs, UseReasonResult, UseReasonStep } from "../types";
import { reasonEngine } from "./engine";
import { createStructuredOutputStreamer } from "./output-stream";
import { parseReasonOutputWithSchema } from "./parsing";
import { withOutputGuardrails } from "./prompting";
import {
  emitReasonStructuredOutput,
  mergeProviderMetadata,
  mergeUsage,
  mergeWarnings,
} from "./result";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const toToolDefinitions = (
  tools: KortyxExecutableTool[],
): KortyxToolDefinition[] =>
  tools.map((tool) => ({
    name: tool.name,
    ...(tool.title ? { title: tool.title } : {}),
    ...(tool.description ? { description: tool.description } : {}),
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema !== undefined
      ? { outputSchema: tool.outputSchema }
      : {}),
    ...(tool.annotations !== undefined
      ? { annotations: tool.annotations }
      : {}),
    ...(tool.metadata !== undefined ? { metadata: tool.metadata } : {}),
  }));

const resolveToolExecutionBoolean = (
  value: boolean | Record<string, boolean> | undefined,
  toolName: string,
  fallback: boolean,
): boolean => {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value[toolName] ?? fallback;
  }
  return fallback;
};

const normalizeToolResult = (
  toolCall: KortyxToolCall,
  value: KortyxToolResult | unknown,
): KortyxToolResult => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "toolCallId" in value &&
    "name" in value &&
    "content" in value
  ) {
    return value as KortyxToolResult;
  }

  let content: string;
  try {
    content = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    content = String(value);
  }

  return {
    toolCallId: toolCall.id,
    name: toolCall.name,
    content,
    ...(value !== undefined &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? { structuredContent: value }
      : {}),
  };
};

const closeOwnedTools = async (
  tools: KortyxExecutableTool[],
): Promise<void> => {
  const closeFns = new Set<NonNullable<KortyxExecutableTool["close"]>>();
  for (const tool of tools) {
    if (tool.closeAfterUse === false || !tool.close) continue;
    closeFns.add(tool.close);
  }

  await Promise.all(
    [...closeFns].map(async (close) => {
      await close();
    }),
  );
};

const createInitialMessages = (args: {
  system?: string | undefined;
  input: string;
}): KortyxPromptMessage[] => [
  ...(typeof args.system === "string" && args.system.length > 0
    ? [{ role: "system" as const, content: args.system }]
    : []),
  { role: "user" as const, content: String(args.input ?? "") },
];

export const runReasonToolLoop = async <
  TOutput,
  TRequest extends InterruptInput,
  TResponse = InterruptResult,
>(args: {
  useReasonArgs: UseReasonArgs<TOutput, TRequest, TResponse>;
  id?: string | undefined;
  opId: string;
  traceSpan?: ReasonTraceSpan | undefined;
  checkpointKey: string;
  initialWarnings?: KortyxWarning[] | undefined;
}): Promise<UseReasonResult<TOutput, TResponse>> => {
  const { useReasonArgs, id, traceSpan, checkpointKey } = args;
  const ctx = getHookContext();
  const abortSignal = combineAbortSignals(
    ctx.node.abortSignal,
    useReasonArgs.abortSignal,
    useReasonArgs.model.options?.abortSignal,
  );
  const saved = ctx.currentNodeState.byKey[checkpointKey] as
    | ToolLoopCheckpoint
    | undefined;
  const checkpoint = saved?.status === "tool_loop" ? saved : undefined;
  const opId = checkpoint?.opId ?? args.opId;
  const tools = useReasonArgs.tools ?? [];
  const toolByName = new Map<string, KortyxExecutableTool>();
  let validationCompleted = false;
  let separateOutput = false;

  try {
    for (const tool of tools) {
      if (toolByName.has(tool.name)) {
        throw new Error(
          `useReason received duplicate tool name "${tool.name}".`,
        );
      }
      toolByName.set(tool.name, tool);
    }

    if (useReasonArgs.interrupt) {
      throw new Error(
        "useReason tools cannot be combined with useReason interrupt mode yet. Use toolExecution.approval for tool approval.",
      );
    }

    separateOutput = Boolean(
      useReasonArgs.model.provider.getModel(useReasonArgs.model.modelId, {
        ...useReasonArgs.model.options,
        ...(useReasonArgs.responseFormat
          ? { responseFormat: useReasonArgs.responseFormat }
          : {}),
        providerOptions:
          resolveProviderOptions(
            useReasonArgs.model.options?.providerOptions,
            useReasonArgs.providerOptions,
          ) ?? {},
      }).requiresSeparateStructuredOutput,
    );
    validationCompleted = true;
  } finally {
    if (!validationCompleted) {
      await closeOwnedTools(tools);
    }
  }

  const toolDefinitions = toToolDefinitions(tools);
  let finalizing = checkpoint?.finalizing ?? false;
  let completed = false;
  const maxSteps = Math.max(1, useReasonArgs.toolExecution?.maxSteps ?? 3);
  const messages =
    checkpoint?.messages ??
    createInitialMessages({
      system: useReasonArgs.system,
      input: useReasonArgs.outputSchema
        ? withOutputGuardrails(useReasonArgs.input, useReasonArgs.outputSchema)
        : useReasonArgs.input,
    });
  const steps: UseReasonStep[] = checkpoint?.steps ?? [];
  const allToolCalls: KortyxToolCall[] = steps.flatMap(
    (step) => step.toolCalls,
  );
  const allToolResults: KortyxToolResult[] = steps.flatMap(
    (step) => step.toolResults,
  );
  let finalText = "";
  let finalRaw: unknown;
  let finalOutput: TOutput | undefined;
  let aggregatedUsage = steps.reduce<KortyxUsage | undefined>(
    (usage, step) => mergeUsage(usage, step.usage),
    undefined,
  );
  let finalFinishReason: KortyxFinishReason | undefined;
  let aggregatedProviderMetadata: KortyxProviderMetadata | undefined;
  let aggregatedWarnings = steps.reduce<KortyxWarning[] | undefined>(
    (warnings, step) => mergeWarnings(warnings, step.warnings),
    args.initialWarnings,
  );
  let pending = checkpoint?.pending;
  const approvedCalls = checkpoint?.approvedCalls ?? [];
  const save = () => {
    ctx.currentNodeState.byKey[checkpointKey] = {
      status: "tool_loop",
      opId,
      messages,
      steps,
      approvedCalls,
      finalizing,
      ...(pending ? { pending } : {}),
    } satisfies ToolLoopCheckpoint;
    ctx.stateDirty = true;
  };

  const emitToolEvent = (
    event: string,
    payload: Record<string, unknown>,
  ): void => {
    ctx.node.emit(event, {
      ...payload,
      node: ctx.node.graph.node,
      ...(id ? { id } : {}),
      opId,
    });
  };

  try {
    for (
      let stepIndex = pending ? steps.length - 1 : steps.length;
      stepIndex < maxSteps;
      stepIndex += 1
    ) {
      throwIfExecutionAborted(abortSignal);
      traceSpan?.addEvent?.("useReason.tool-step.start", {
        stepIndex,
        toolCount: toolDefinitions.length,
      });

      const reused = Boolean(pending);
      const stream =
        useReasonArgs.stream ?? useReasonArgs.model.options?.streaming ?? true;
      const emit = useReasonArgs.emit ?? true;
      let textStarted = false;
      const structuredChunk =
        useReasonArgs.outputSchema &&
        (!separateOutput || finalizing) &&
        stream &&
        emit &&
        shouldStreamStructured(useReasonArgs.structured)
          ? createStructuredOutputStreamer(useReasonArgs, id, opId)
          : undefined;
      const step =
        pending ??
        (await reasonEngine(
          {
            ...useReasonArgs,
            tools: finalizing ? [] : toolDefinitions,
            ...(separateOutput && !finalizing
              ? { responseFormat: { type: "text" as const } }
              : {}),
            messages,
            emit: false,
            stream,
            onTextChunk: (delta) => {
              if (structuredChunk) structuredChunk(delta);
              if (!emit || useReasonArgs.outputSchema || !delta) return;
              if (!textStarted) {
                emitToolEvent("text-start", {});
                textStarted = true;
              }
              emitToolEvent("text-delta", { delta });
            },
          },
          { ...(id ? { id } : {}), opId },
        ));

      if (textStarted) emitToolEvent("text-end", {});
      finalText = step.text;
      finalRaw = step.raw;
      if (!reused) {
        aggregatedUsage = mergeUsage(aggregatedUsage, step.usage);
        accumulateTokenUsage(step.usage);
      }
      finalFinishReason = step.finishReason;
      aggregatedProviderMetadata = mergeProviderMetadata(
        aggregatedProviderMetadata,
        step.providerMetadata,
      );
      aggregatedWarnings = mergeWarnings(aggregatedWarnings, step.warnings);

      const toolCalls = step.toolCalls ?? [];
      const toolResults: KortyxToolResult[] = reused
        ? (steps[stepIndex]?.toolResults ?? [])
        : [];
      if (!reused)
        steps.push({
          stepIndex,
          text: step.text,
          toolCalls,
          toolResults,
          ...(step.usage ? { usage: step.usage } : {}),
          ...(step.finishReason ? { finishReason: step.finishReason } : {}),
          ...(step.providerMetadata
            ? { providerMetadata: step.providerMetadata }
            : {}),
          ...(step.warnings ? { warnings: step.warnings } : {}),
        });

      if (toolCalls.length === 0) {
        if (separateOutput && !finalizing) {
          messages.push({
            role: "assistant",
            content: step.text,
            ...(step.continuation ? { continuation: step.continuation } : {}),
          });
          messages.push({
            role: "user",
            content:
              "Return the final answer using the requested output schema and the tool results above.",
          });
          finalizing = true;
          pending = undefined;
          save();
          continue;
        }
        completed = true;
        break;
      }
      if (finalizing)
        throw new Error(
          "Provider requested a tool during schema-only finalization.",
        );

      if (!reused) {
        allToolCalls.push(...toolCalls);
        messages.push({
          role: "assistant",
          content: step.text,
          toolCalls,
          ...(step.continuation ? { continuation: step.continuation } : {}),
        });
      }
      pending = step;
      save();

      for (const toolCall of toolCalls) {
        if (toolResults.some((result) => result.toolCallId === toolCall.id))
          continue;
        throwIfExecutionAborted(abortSignal);
        const tool = toolByName.get(toolCall.name);
        if (!tool) {
          throw new Error(
            `Model requested unknown tool "${toolCall.name}" from useReason.`,
          );
        }

        const shouldEmitTool = resolveToolExecutionBoolean(
          useReasonArgs.toolExecution?.emit,
          tool.name,
          false,
        );
        const shouldApproveTool = resolveToolExecutionBoolean(
          useReasonArgs.toolExecution?.approval,
          tool.name,
          false,
        );

        traceSpan?.addEvent?.("useReason.tool-call.start", {
          stepIndex,
          tool: tool.name,
          toolCallId: toolCall.id,
        });

        if (shouldEmitTool) {
          emitToolEvent("tool-call-start", {
            tool: tool.name,
            toolCallId: toolCall.id,
            input: toolCall.input,
          });
        }

        if (shouldApproveTool && !approvedCalls.includes(toolCall.id)) {
          const approval = await awaitInterruptInternal({
            id: `tool:${toolCall.id}`,
            request: {
              kind: "choice",
              question: `Approve ${tool.name}?`,
              options: [
                { id: "approve", label: "Approve" },
                { id: "deny", label: "Deny" },
              ],
              meta: {
                tool: tool.name,
                toolCallId: toolCall.id,
                input: toolCall.input,
              },
            },
          });

          const approved = Array.isArray(approval)
            ? approval.includes("approve")
            : approval === "approve";

          if (!approved) {
            const denied = {
              toolCallId: toolCall.id,
              name: tool.name,
              content: "Tool call denied by user.",
              isError: true,
            } satisfies KortyxToolResult;
            toolResults.push(denied);
            allToolResults.push(denied);
            if (shouldEmitTool) {
              emitToolEvent("tool-call-result", {
                tool: tool.name,
                toolCallId: toolCall.id,
                content: denied.content,
                isError: true,
              });
            }
            messages.push({
              role: "tool",
              content: denied.content,
              toolCallId: denied.toolCallId,
              name: denied.name,
              isError: true,
            });
            save();
            continue;
          }
          approvedCalls.push(toolCall.id);
          save();
        }

        try {
          throwIfExecutionAborted(abortSignal);
          ctx.node.consumeExecution?.("maxToolCalls");
          const rawResult = await tool.execute(toolCall.input, {
            toolCallId: toolCall.id,
            ...(abortSignal ? { abortSignal } : {}),
          });
          throwIfExecutionAborted(abortSignal);
          const result = normalizeToolResult(toolCall, rawResult);
          toolResults.push(result);
          allToolResults.push(result);
          if (shouldEmitTool) {
            emitToolEvent("tool-call-result", {
              tool: result.name,
              toolCallId: result.toolCallId,
              content: result.content,
              ...(result.structuredContent !== undefined
                ? { structuredContent: result.structuredContent }
                : {}),
              ...(result.isError !== undefined
                ? { isError: result.isError }
                : {}),
            });
          }
          traceSpan?.addEvent?.("useReason.tool-call.complete", {
            stepIndex,
            tool: result.name,
            toolCallId: result.toolCallId,
            isError: Boolean(result.isError),
          });
        } catch (error) {
          throwIfExecutionAborted(abortSignal);
          if (isExecutionLimitReached(error) || isExecutionCancelled(error))
            throw error;
          const result = {
            toolCallId: toolCall.id,
            name: tool.name,
            content: toErrorMessage(error),
            isError: true,
          } satisfies KortyxToolResult;
          toolResults.push(result);
          allToolResults.push(result);
          if (shouldEmitTool) {
            emitToolEvent("tool-call-error", {
              tool: tool.name,
              toolCallId: toolCall.id,
              message: result.content,
            });
          }
          traceSpan?.addEvent?.("useReason.tool-call.error", {
            stepIndex,
            tool: tool.name,
            toolCallId: toolCall.id,
            message: result.content,
          });
        }
        const completed = toolResults.at(-1);
        if (completed)
          messages.push({
            role: "tool",
            content: completed.content,
            toolCallId: completed.toolCallId,
            name: completed.name,
            ...(completed.isError !== undefined
              ? { isError: completed.isError }
              : {}),
          });
        save();
      }

      pending = undefined;
      save();
    }

    if (!completed) {
      throw new Error(
        `useReason tool loop reached maxSteps (${maxSteps}) before producing a final response.`,
      );
    }

    if (useReasonArgs.outputSchema) {
      finalOutput = parseReasonOutputWithSchema({
        text: finalText,
        schema: useReasonArgs.outputSchema,
        ...(finalFinishReason ? { finishReason: finalFinishReason } : {}),
        label: "useReason output",
      });
    }

    if (finalOutput !== undefined) {
      emitReasonStructuredOutput<TOutput>({
        ...(id ? { id } : {}),
        opId,
        output: finalOutput,
        structured: useReasonArgs.structured,
        emit: useReasonArgs.emit ?? true,
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
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      steps,
    } satisfies UseReasonResult<TOutput, TResponse>;

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
        toolCallCount: allToolCalls.length,
        toolResultCount: allToolResults.length,
        toolStepCount: steps.length,
      },
      telemetry: {
        ...(useReasonArgs.telemetry ?? {}),
        output: useReasonArgs.telemetry?.output ?? finalOutput ?? finalText,
      },
    });

    ctx.currentNodeState.byKey[checkpointKey] = { status: "completed", result };
    ctx.stateDirty = true;
    return result;
  } catch (error) {
    traceSpan?.fail?.(error, {
      attributes: {
        toolStepCount: steps.length,
        toolCallCount: allToolCalls.length,
      },
    });
    throw error;
  } finally {
    await closeOwnedTools(tools);
  }
};

interface ToolLoopCheckpoint {
  status: "tool_loop";
  opId: string;
  messages: KortyxPromptMessage[];
  steps: UseReasonStep[];
  pending?: RunReasonEngineResult;
  approvedCalls: string[];
  finalizing?: boolean;
}
