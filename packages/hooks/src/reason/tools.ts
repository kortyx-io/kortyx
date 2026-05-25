import type { InterruptInput, InterruptResult } from "@kortyx/core";
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
import { getHookContext } from "../context";
import { awaitInterruptInternal } from "../interrupt";
import type { ReasonTraceSpan } from "../tracing";
import type { UseReasonArgs, UseReasonResult, UseReasonStep } from "../types";
import { reasonEngine } from "./engine";
import { parseReasonOutputWithSchema } from "./parsing";
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
}): Promise<UseReasonResult<TOutput, TResponse>> => {
  const { useReasonArgs, id, opId, traceSpan } = args;
  const ctx = getHookContext();
  const tools = useReasonArgs.tools ?? [];
  const toolByName = new Map<string, KortyxExecutableTool>();
  let validationCompleted = false;

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

    validationCompleted = true;
  } finally {
    if (!validationCompleted) {
      await closeOwnedTools(tools);
    }
  }

  const toolDefinitions = toToolDefinitions(tools);
  const maxSteps = Math.max(1, useReasonArgs.toolExecution?.maxSteps ?? 3);
  const messages = createInitialMessages({
    system: useReasonArgs.system,
    input: useReasonArgs.input,
  });
  const steps: UseReasonStep[] = [];
  const allToolCalls: KortyxToolCall[] = [];
  const allToolResults: KortyxToolResult[] = [];
  let finalText = "";
  let finalRaw: unknown;
  let finalOutput: TOutput | undefined;
  let aggregatedUsage: KortyxUsage | undefined;
  let finalFinishReason: KortyxFinishReason | undefined;
  let aggregatedProviderMetadata: KortyxProviderMetadata | undefined;
  let aggregatedWarnings: KortyxWarning[] | undefined;

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
    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
      traceSpan?.addEvent?.("useReason.tool-step.start", {
        stepIndex,
        toolCount: toolDefinitions.length,
      });

      const step = await reasonEngine(
        {
          ...useReasonArgs,
          tools: toolDefinitions,
          messages,
          emit: false,
          stream: false,
        },
        { ...(id ? { id } : {}), opId },
      );

      finalText = step.text;
      finalRaw = step.raw;
      aggregatedUsage = mergeUsage(aggregatedUsage, step.usage);
      finalFinishReason = step.finishReason;
      aggregatedProviderMetadata = mergeProviderMetadata(
        aggregatedProviderMetadata,
        step.providerMetadata,
      );
      aggregatedWarnings = mergeWarnings(aggregatedWarnings, step.warnings);

      const toolCalls = step.toolCalls ?? [];
      const toolResults: KortyxToolResult[] = [];
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
        if ((useReasonArgs.emit ?? true) && step.text.length > 0) {
          emitToolEvent("text-start", {});
          emitToolEvent("text-delta", { delta: step.text });
          emitToolEvent("text-end", {});
        }
        break;
      }

      allToolCalls.push(...toolCalls);
      messages.push({
        role: "assistant",
        content: step.text,
        toolCalls,
      });

      for (const toolCall of toolCalls) {
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

        if (shouldEmitTool) {
          emitToolEvent("tool-call-start", {
            tool: tool.name,
            toolCallId: toolCall.id,
            input: toolCall.input,
          });
        }

        if (shouldApproveTool) {
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
            continue;
          }
        }

        try {
          const rawResult = await tool.execute(toolCall.input, {
            toolCallId: toolCall.id,
            ...(useReasonArgs.abortSignal
              ? { abortSignal: useReasonArgs.abortSignal }
              : {}),
          });
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
      }

      const currentStep = steps[steps.length - 1];
      if (currentStep) {
        steps[steps.length - 1] = {
          ...currentStep,
          toolResults,
        };
      }

      for (const result of toolResults) {
        messages.push({
          role: "tool",
          content: result.content,
          toolCallId: result.toolCallId,
          name: result.name,
          ...(result.structuredContent !== undefined
            ? { structuredContent: result.structuredContent }
            : {}),
          ...(result.isError !== undefined ? { isError: result.isError } : {}),
          ...(result.raw !== undefined ? { raw: result.raw } : {}),
        });
      }
    }

    if (steps.length >= maxSteps && steps.at(-1)?.toolCalls.length) {
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
