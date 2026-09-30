import type { InterruptInput, InterruptResult } from "@kortyx/core";
import { combineAbortSignals, throwIfExecutionAborted } from "@kortyx/core";
import { isControlFlowError, serializeFailure } from "@kortyx/core/errors";
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
import { toJSONSchema } from "zod";
import { accumulateTokenUsage, getHookContext } from "../context";
import { awaitInterruptInternal } from "../interrupt";
import {
  interruptControlToolName,
  isInterruptControlToolName,
  isLegacyInterruptContracts,
  normalizeReasonInterrupts,
} from "../interrupt-contract";
import {
  isOutputControlToolName,
  outputControlToolName,
} from "../output-contract";
import {
  type RunReasonEngineResult,
  resolveProviderOptions,
} from "../reason-engine";
import { emitStructuredData, shouldStreamStructured } from "../structured";
import {
  executeObservedTool,
  observeToolFact,
  replayToolObservations,
} from "../tool";
import type { ReasonTraceSpan } from "../tracing";
import type {
  InterruptContract,
  InterruptContractMap,
  InterruptHistoryEntry,
  OutputContract,
  OutputContractEntry,
  OutputContractMap,
  UseReasonArgs,
  UseReasonResult,
  UseReasonStep,
} from "../types";
import { parseWithSchema } from "../validation";
import { reasonEngine } from "./engine";
import { inferOutputFormat } from "./output-format";
import { createStructuredOutputStreamer } from "./output-stream";
import { parseReasonOutputWithSchema } from "./parsing";
import { withOutputGuardrails } from "./prompting";
import {
  emitReasonStructuredOutput,
  mergeProviderMetadata,
  mergeUsage,
  mergeWarnings,
} from "./result";

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
    "content" in value &&
    typeof value.content === "string"
  ) {
    const result = value as KortyxToolResult;
    return { ...result, toolCallId: toolCall.id, name: toolCall.name };
  }

  let content: string;
  try {
    content =
      typeof value === "string"
        ? value
        : (JSON.stringify(value) ?? String(value));
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

const createInitialMessages = (args: {
  system?: string | undefined;
  input: string;
  interruptInstructions?: string | undefined;
  outputInstructions?: string | undefined;
}): KortyxPromptMessage[] => [
  ...(typeof args.system === "string" ||
  args.interruptInstructions ||
  args.outputInstructions
    ? [
        {
          role: "system" as const,
          content: [
            args.system,
            args.interruptInstructions,
            args.outputInstructions,
          ]
            .filter((value): value is string => Boolean(value))
            .join("\n\n"),
        },
      ]
    : []),
  { role: "user" as const, content: String(args.input ?? "") },
];

export const runReasonToolLoop = async <
  TOutput,
  TRequest extends InterruptInput,
  TResponse = InterruptResult,
  TContracts extends InterruptContractMap = InterruptContractMap,
  TEmit extends OutputContractMap = OutputContractMap,
  TReturn extends OutputContractMap = OutputContractMap,
>(args: {
  useReasonArgs: UseReasonArgs<
    TOutput,
    TRequest,
    TResponse,
    TContracts,
    TEmit,
    TReturn
  >;
  id?: string | undefined;
  opId: string;
  traceSpan?: ReasonTraceSpan | undefined;
  checkpointKey: string;
  initialWarnings?: KortyxWarning[] | undefined;
  allowValidatedToolOutput?: boolean;
}): Promise<
  UseReasonResult<TOutput, TResponse, TContracts, TEmit, TReturn>
> => {
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
  const interruptConfig = normalizeReasonInterrupts({
    interrupt: useReasonArgs.interrupt,
    interrupts: useReasonArgs.interrupts,
  });
  const interruptByToolName = new Map<
    string,
    { name: string; contract: InterruptContract<unknown, unknown> }
  >();
  const outputByToolName = new Map<
    string,
    {
      name: string;
      kind: "emit" | "return";
      contract: OutputContract<unknown>;
      stream: boolean;
    }
  >();
  const toolByName = new Map<string, KortyxExecutableTool>();
  let separateOutput = false;

  for (const tool of tools) {
    if (
      isInterruptControlToolName(tool.name) ||
      isOutputControlToolName(tool.name)
    )
      throw new Error(
        `useReason tool name "${tool.name}" uses a reserved control-tool namespace.`,
      );
    if (toolByName.has(tool.name)) {
      throw new Error(`useReason received duplicate tool name "${tool.name}".`);
    }
    toolByName.set(tool.name, tool);
  }

  separateOutput = Boolean(
    useReasonArgs.model.provider.getModel(useReasonArgs.model.modelId, {
      ...useReasonArgs.model.options,
      ...(useReasonArgs.reasoning !== undefined
        ? { reasoning: useReasonArgs.reasoning }
        : {}),
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

  const interruptDefinitions: KortyxToolDefinition[] = [];
  for (const [name, contract] of Object.entries(
    interruptConfig?.contracts ?? {},
  )) {
    const toolName = interruptControlToolName(name);
    if (toolByName.has(toolName))
      throw new Error(
        `useReason tool name "${toolName}" is reserved for interrupt contracts.`,
      );
    let inputSchema: unknown;
    try {
      inputSchema = toJSONSchema(contract.requestSchema as never);
    } catch (error) {
      throw new Error(
        `useReason interrupt contract "${name}" requestSchema must support JSON Schema conversion.`,
        { cause: error },
      );
    }
    interruptByToolName.set(toolName, { name, contract });
    interruptDefinitions.push({
      name: toolName,
      title: `Request human input: ${name}`,
      description: [
        contract.description,
        "Call this only when human input is needed. Execution pauses until the validated response is returned as this tool's result.",
      ].join(" "),
      inputSchema,
      metadata: {
        kortyxControl: "interrupt",
        contract: name,
        schemaId: contract.schemaId,
        schemaVersion: contract.schemaVersion,
      },
    });
  }
  const outputDefinitions: KortyxToolDefinition[] = [];
  for (const kind of ["emit", "return"] as const) {
    for (const [name, contract] of Object.entries(
      useReasonArgs.outputs?.[kind] ?? {},
    )) {
      if (contract.stream) {
        const streamName = outputControlToolName(
          kind === "emit" ? "stream-emit" : "stream-return",
          name,
        );
        outputByToolName.set(streamName, {
          name,
          kind,
          contract,
          stream: true,
        });
        outputDefinitions.push({
          name: streamName,
          title: `Stream structured output: ${name}`,
          description: `${contract.description} Call this to start realtime generation of this structured value. The value is generated in a separate streamed model pass, validated, and ${kind === "emit" ? "returned as a tool result so you can continue" : "used to finish this operation"}.`,
          inputSchema: {
            type: "object",
            properties: {
              instruction: {
                type: "string",
                description: "What the streamed output should contain.",
              },
            },
            required: ["instruction"],
            additionalProperties: false,
          },
          metadata: {
            kortyxControl:
              kind === "emit" ? "output.stream.emit" : "output.stream.return",
            contract: name,
            schemaId: contract.schemaId,
            schemaVersion: contract.schemaVersion,
          },
        });
      } else {
        const toolName = outputControlToolName(kind, name);
        outputByToolName.set(toolName, { name, kind, contract, stream: false });
        outputDefinitions.push({
          name: toolName,
          title: `${kind === "emit" ? "Emit" : "Return"} structured output: ${name}`,
          description: `${contract.description} ${kind === "emit" ? "Emit this structured value and continue reasoning." : "Return this structured value and finish reasoning."}`,
          inputSchema: toJSONSchema(contract.schema as never),
          metadata: {
            kortyxControl: kind === "emit" ? "output.emit" : "output.return",
            contract: name,
            schemaId: contract.schemaId,
            schemaVersion: contract.schemaVersion,
          },
        });
      }
    }
  }
  const toolDefinitions = [
    ...toToolDefinitions(tools),
    ...interruptDefinitions,
    ...outputDefinitions,
  ];
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
      ...(interruptConfig
        ? {
            interruptInstructions: [
              "Human-input rules:",
              "- The kortyx_request_input__* tools pause this reasoning operation and return the validated human response as a normal tool result.",
              "- Call at most one human-input tool in a model turn, and do not combine it with other tool calls in that turn.",
              interruptConfig.mode === "required"
                ? "- You must call at least one human-input tool before returning the final answer."
                : "- Human input is optional; call a human-input tool only when the request cannot be completed safely without it.",
            ].join("\n"),
          }
        : {}),
      ...(useReasonArgs.outputs
        ? {
            outputInstructions: [
              "Structured output rules:",
              "- The kortyx_emit__* tools publish validated structured output and return an acknowledgement. You may continue with text or more tools afterward.",
              "- The kortyx_return__* tools publish a validated result and end this reasoning operation. If return tools are available, call exactly one before finishing.",
              "- For contracts with realtime streaming, use kortyx_stream_emit__* or kortyx_stream_return__*. These start a separate streamed JSON generation; its fields become visible as tokens arrive.",
              "- Call a structured output control tool alone in its model turn.",
            ].join("\n"),
          }
        : {}),
    });
  const steps: UseReasonStep[] = checkpoint?.steps ?? [];
  const allToolCalls: KortyxToolCall[] = steps
    .flatMap((step) => step.toolCalls)
    .filter(
      (call) =>
        !interruptByToolName.has(call.name) && !outputByToolName.has(call.name),
    );
  const knownToolCallIds = new Set(
    steps.flatMap((step) => step.toolCalls.map((call) => call.id)),
  );
  const allToolResults: KortyxToolResult[] = steps
    .flatMap((step) => step.toolResults)
    .filter(
      (result) =>
        !interruptByToolName.has(result.name) &&
        !outputByToolName.has(result.name),
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
  let pendingStepIndex = checkpoint?.pendingStepIndex;
  const approvedCalls = checkpoint?.approvedCalls ?? [];
  const interruptHistory = (checkpoint?.interruptHistory ?? []) as Array<
    InterruptHistoryEntry<TContracts>
  >;
  const emissions = (checkpoint?.emissions ??
    []) as OutputContractEntry<TEmit>[];
  let returned = checkpoint?.returned as
    | OutputContractEntry<TReturn>
    | undefined;
  const save = () => {
    ctx.currentNodeState.byKey[checkpointKey] = {
      status: "tool_loop",
      opId,
      messages,
      steps,
      approvedCalls,
      interruptHistory,
      emissions,
      ...(returned ? { returned } : {}),
      finalizing,
      ...(pending ? { pending } : {}),
      ...(pending && pendingStepIndex !== undefined
        ? { pendingStepIndex }
        : {}),
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
      let stepIndex = pending
        ? (pendingStepIndex ?? steps.length - 1)
        : steps.length;
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
      const segmentId = `step-${stepIndex}`;
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
                emitToolEvent("text-start", { segmentId });
                textStarted = true;
              }
              emitToolEvent("text-delta", { delta, segmentId });
            },
          },
          { ...(id ? { id } : {}), opId },
        ));

      if (textStarted) emitToolEvent("text-end", { segmentId });
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
      const ids = new Set<string>();
      for (const call of toolCalls) {
        if (
          !call.id ||
          ids.has(call.id) ||
          (!reused && knownToolCallIds.has(call.id))
        )
          throw new Error("Model returned duplicate or empty tool call IDs.");
        ids.add(call.id);
      }
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
      if (!reused) for (const call of toolCalls) knownToolCallIds.add(call.id);

      if (toolCalls.length === 0) {
        if (
          Object.keys(useReasonArgs.outputs?.return ?? {}).length > 0 &&
          !returned
        )
          throw new Error(
            "useReason outputs.return requires one terminal output contract call.",
          );
        if (
          interruptConfig?.mode === "required" &&
          interruptHistory.length === 0
        )
          throw new Error(
            "useReason interrupts.mode is required, but the model returned a final answer without requesting human input.",
          );
        if (separateOutput && !finalizing) {
          if (args.allowValidatedToolOutput && useReasonArgs.outputSchema) {
            try {
              finalOutput = parseReasonOutputWithSchema({
                text: step.text,
                schema: useReasonArgs.outputSchema,
                ...(step.finishReason
                  ? { finishReason: step.finishReason }
                  : {}),
                ...(aggregatedUsage ? { usage: aggregatedUsage } : {}),
                label: "useReason output",
              });
              aggregatedWarnings = mergeWarnings(aggregatedWarnings, [
                {
                  type: "compatibility",
                  feature: "responseFormat",
                  details:
                    "Reused locally validated tool-phase output without an extra native-schema request. Set responseFormat.schema explicitly to require provider schema enforcement.",
                },
              ]);
              completed = true;
              break;
            } catch {
              // A schema-only pass can repair a nonconforming draft, within the existing limits.
            }
          }
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
          pendingStepIndex = undefined;
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
        allToolCalls.push(
          ...toolCalls.filter(
            (call) =>
              !interruptByToolName.has(call.name) &&
              !outputByToolName.has(call.name),
          ),
        );
        messages.push({
          role: "assistant",
          content: step.text,
          toolCalls,
          ...(step.continuation ? { continuation: step.continuation } : {}),
        });
      }
      pending = step;
      pendingStepIndex = stepIndex;
      save();

      const outputCalls = toolCalls.filter((call) =>
        outputByToolName.has(call.name),
      );
      if (outputCalls.length > 0) {
        if (toolCalls.length !== 1)
          throw new Error(
            "A useReason output contract call must be the only tool call in its model turn.",
          );
        const call = outputCalls[0];
        if (!call) throw new Error("Missing useReason output control call.");
        const resolved = outputByToolName.get(call.name);
        if (!resolved)
          throw new Error(
            `Unknown useReason output contract tool "${call.name}".`,
          );
        if (toolResults.some((result) => result.toolCallId === call.id)) {
          pending = undefined;
          pendingStepIndex = undefined;
          save();
          continue;
        }
        if (
          resolved.kind === "emit" &&
          emissions.length >= (useReasonArgs.outputs?.maxEmissions ?? 16)
        )
          throw new Error(
            `useReason reached outputs.maxEmissions (${useReasonArgs.outputs?.maxEmissions ?? 16}).`,
          );
        let data: unknown;
        if (resolved.stream) {
          if (!stream)
            throw new Error(
              `useReason streaming output contract "${resolved.name}" requires stream: true.`,
            );
          if (stepIndex + 1 >= maxSteps)
            throw new Error(
              `useReason output streaming requires another model pass within maxSteps (${maxSteps}).`,
            );
          const instruction =
            call.input &&
            typeof call.input === "object" &&
            !Array.isArray(call.input)
              ? (call.input as Record<string, unknown>).instruction
              : undefined;
          if (
            typeof instruction !== "string" ||
            instruction.trim().length === 0
          )
            throw new Error(
              `useReason streaming output contract "${resolved.name}" requires an instruction.`,
            );
          const streamId = `${opId}:${resolved.kind}:${resolved.name}:${resolved.kind === "emit" ? emissions.length : "return"}`;
          const structured = {
            dataType: resolved.contract.schemaId,
            schemaId: resolved.contract.schemaId,
            schemaVersion: resolved.contract.schemaVersion,
            fields: resolved.contract.stream?.fields,
          };
          const inferred = inferOutputFormat(
            resolved.contract.schema,
            undefined,
          );
          try {
            const outputStep = await reasonEngine(
              {
                ...useReasonArgs,
                tools: [],
                ...(inferred.responseFormat
                  ? { responseFormat: inferred.responseFormat }
                  : {}),
                messages: [
                  ...messages,
                  {
                    role: "tool",
                    toolCallId: call.id,
                    name: call.name,
                    content: "Generating the requested structured output.",
                  },
                  {
                    role: "user",
                    content: withOutputGuardrails(
                      instruction,
                      resolved.contract.schema,
                    ),
                  },
                ],
                emit: false,
                stream,
                ...(emit && stream
                  ? {
                      onTextChunk: createStructuredOutputStreamer(
                        { structured },
                        id,
                        streamId,
                      ),
                    }
                  : {}),
              },
              { ...(id ? { id } : {}), opId },
            );
            if (outputStep.toolCalls?.length)
              throw new Error(
                `Provider requested a tool during streamed output contract "${resolved.name}".`,
              );
            aggregatedUsage = mergeUsage(aggregatedUsage, outputStep.usage);
            accumulateTokenUsage(outputStep.usage);
            aggregatedWarnings = mergeWarnings(
              aggregatedWarnings,
              mergeWarnings(inferred.warnings, outputStep.warnings),
            );
            aggregatedProviderMetadata = mergeProviderMetadata(
              aggregatedProviderMetadata,
              outputStep.providerMetadata,
            );
            finalFinishReason = outputStep.finishReason;
            finalRaw = outputStep.raw;
            data = parseReasonOutputWithSchema({
              text: outputStep.text,
              schema: resolved.contract.schema,
              ...(outputStep.finishReason
                ? { finishReason: outputStep.finishReason }
                : {}),
              ...(aggregatedUsage ? { usage: aggregatedUsage } : {}),
              label: `useReason output contract "${resolved.name}"`,
            });
            steps.push({
              stepIndex: stepIndex + 1,
              kind: "output",
              text: outputStep.text,
              toolCalls: [],
              toolResults: [],
              ...(outputStep.usage ? { usage: outputStep.usage } : {}),
              ...(outputStep.finishReason
                ? { finishReason: outputStep.finishReason }
                : {}),
              ...(outputStep.providerMetadata
                ? { providerMetadata: outputStep.providerMetadata }
                : {}),
              ...(outputStep.warnings ? { warnings: outputStep.warnings } : {}),
            });
            stepIndex += 1;
          } catch (error) {
            traceSpan?.addEvent?.("useReason.output.invalidated", {
              contract: resolved.name,
              kind: resolved.kind,
              schemaId: resolved.contract.schemaId,
              schemaVersion: resolved.contract.schemaVersion,
              streamId,
            });
            if (emit) {
              try {
                ctx.node.emit("structured_data_invalidated", {
                  node: ctx.node.graph.node,
                  streamId,
                });
              } catch {
                // Reporting must not replace the generation or validation error.
              }
            }
            throw error;
          }
        } else {
          data = parseWithSchema(
            resolved.contract.schema,
            call.input,
            `useReason output contract "${resolved.name}"`,
          );
        }
        const entry = { contract: resolved.name, data };
        const emissionIndex = emissions.length;
        if (resolved.kind === "emit")
          emissions.push(entry as OutputContractEntry<TEmit>);
        else returned = entry as OutputContractEntry<TReturn>;
        if (emit)
          emitStructuredData({
            kind: "final",
            data,
            dataType: resolved.contract.schemaId,
            schemaId: resolved.contract.schemaId,
            schemaVersion: resolved.contract.schemaVersion,
            streamId: `${opId}:${resolved.kind}:${resolved.name}:${resolved.kind === "emit" ? emissionIndex : "return"}`,
            ...(id ? { id } : {}),
          });
        traceSpan?.addEvent?.("useReason.output.emitted", {
          contract: resolved.name,
          kind: resolved.kind,
          schemaId: resolved.contract.schemaId,
          schemaVersion: resolved.contract.schemaVersion,
          emissionIndex,
          data,
        });
        if (resolved.kind === "return") {
          pending = undefined;
          pendingStepIndex = undefined;
          completed = true;
          save();
          break;
        }
        const result = normalizeToolResult(call, { emitted: true, data });
        toolResults.push(result);
        messages.push({
          role: "tool",
          content: result.content,
          toolCallId: result.toolCallId,
          name: result.name,
        });
        pending = undefined;
        pendingStepIndex = undefined;
        save();
        continue;
      }

      const interruptCalls = toolCalls.filter((call) =>
        interruptByToolName.has(call.name),
      );
      if (interruptCalls.length > 0) {
        if (toolCalls.length !== 1)
          throw new Error(
            "A useReason interrupt contract call must be the only tool call in its model turn.",
          );
        const interruptCall = interruptCalls[0];
        if (!interruptCall)
          throw new Error("Missing useReason interrupt control call.");
        if (interruptHistory.length >= (interruptConfig?.maxRequests ?? 1))
          throw new Error(
            `useReason reached interrupts.maxRequests (${interruptConfig?.maxRequests ?? 1}).`,
          );
        const resolved = interruptByToolName.get(interruptCall.name);
        if (!resolved)
          throw new Error(
            `Unknown useReason interrupt contract tool "${interruptCall.name}".`,
          );
        if (
          toolResults.some((result) => result.toolCallId === interruptCall.id)
        ) {
          pending = undefined;
          pendingStepIndex = undefined;
          save();
          continue;
        }
        const request = parseWithSchema(
          resolved.contract.requestSchema,
          interruptCall.input,
          `useReason interrupt contract "${resolved.name}" request`,
        );
        traceSpan?.addEvent?.("useReason.interrupt.requested", {
          checkpointKey,
          contract: resolved.name,
          interruptIndex: interruptHistory.length,
        });
        const question =
          request &&
          typeof request === "object" &&
          !Array.isArray(request) &&
          typeof (request as Record<string, unknown>).question === "string"
            ? String((request as Record<string, unknown>).question)
            : undefined;
        const response = await awaitInterruptInternal({
          request: {
            kind: "custom",
            request,
            contract: resolved.name,
            ...(question ? { question } : {}),
            schemaId: resolved.contract.schemaId,
            schemaVersion: resolved.contract.schemaVersion,
          },
          responseSchema: resolved.contract.responseSchema,
          id: `${id ?? "reason"}:${resolved.name}:${interruptHistory.length + 1}`,
          meta: {
            __kortyxReason: {
              opId,
              stepIndex,
              interruptIndex: interruptHistory.length,
              contract: resolved.name,
            },
          },
        });
        const result = normalizeToolResult(interruptCall, response);
        toolResults.push(result);
        messages.push({
          role: "tool",
          content: result.content,
          toolCallId: result.toolCallId,
          name: result.name,
        });
        interruptHistory.push({
          contract: resolved.name,
          request,
          response,
        } as InterruptHistoryEntry<TContracts>);
        traceSpan?.addEvent?.("useReason.interrupt.resolved", {
          checkpointKey,
          contract: resolved.name,
          interruptIndex: interruptHistory.length - 1,
        });
        pending = undefined;
        pendingStepIndex = undefined;
        save();
        continue;
      }

      for (const toolCall of toolCalls) {
        if (toolResults.some((result) => result.toolCallId === toolCall.id)) {
          await replayToolObservations(
            steps[stepIndex]?.toolObservations?.filter(
              (observation) =>
                observation.toolCallId === `${opId}:${toolCall.id}`,
            ) ?? [],
          );
          continue;
        }
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

        if (shouldEmitTool) {
          emitToolEvent("tool-call-start", {
            tool: tool.name,
            toolCallId: toolCall.id,
            input: toolCall.input,
          });
        }

        if (shouldApproveTool && !approvedCalls.includes(toolCall.id)) {
          await observeToolFact(
            {
              version: 1,
              name: tool.name,
              toolCallId: `${opId}:${toolCall.id}`,
              attemptId: `${opId}:${toolCall.id}:approval`,
              callingMode: "model",
              executed: false,
            },
            "waiting",
          );
          const approval = await awaitInterruptInternal({
            id: `tool:${toolCall.id}`,
            request: {
              kind: "choice",
              question: `Approve ${tool.name}?`,
              options: [
                { id: "approve", label: "Approve" },
                { id: "deny", label: "Deny" },
              ],
            },
            meta: {
              tool: tool.name,
              toolCallId: toolCall.id,
              input: toolCall.input,
            },
          });

          const approved = Array.isArray(approval)
            ? approval.includes("approve")
            : approval === "approve";

          if (!approved) {
            const deniedObservation = {
              version: 1 as const,
              name: tool.name,
              toolCallId: `${opId}:${toolCall.id}`,
              attemptId: `${opId}:${toolCall.id}:approval`,
              callingMode: "model" as const,
              executed: false,
              outcome: "denied" as const,
              denialCode: "APPROVAL_DENIED",
            };
            await observeToolFact(deniedObservation);
            const entry = steps[stepIndex];
            if (entry) {
              entry.toolObservations ??= [];
              entry.toolObservations.push(deniedObservation);
            }
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
          const rawResult = await executeObservedTool({
            tool,
            input: toolCall.input,
            toolCallId: `${opId}:${toolCall.id}`,
            providerToolCallId: toolCall.id,
            callingMode: "model",
            abortSignal,
            onObservation: (observation) => {
              const entry = steps[stepIndex];
              if (entry) {
                entry.toolObservations ??= [];
                entry.toolObservations.push(observation);
                save();
              }
            },
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
        } catch (error) {
          throwIfExecutionAborted(abortSignal);
          if (isControlFlowError(error)) throw error;
          const result = {
            toolCallId: toolCall.id,
            name: tool.name,
            content: serializeFailure(error).message,
            failure: serializeFailure(error),
            isError: true,
          } satisfies KortyxToolResult;
          toolResults.push(result);
          allToolResults.push(result);
          if (shouldEmitTool) {
            emitToolEvent("tool-call-error", {
              tool: tool.name,
              toolCallId: toolCall.id,
              message: result.content,
              failure: result.failure,
            });
          }
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
      pendingStepIndex = undefined;
      save();
    }

    if (!completed) {
      throw new Error(
        `useReason tool loop reached maxSteps (${maxSteps}) before producing a final response.`,
      );
    }

    if (useReasonArgs.outputSchema && finalOutput === undefined) {
      finalOutput = parseReasonOutputWithSchema({
        text: finalText,
        schema: useReasonArgs.outputSchema,
        ...(finalFinishReason ? { finishReason: finalFinishReason } : {}),
        ...(aggregatedUsage ? { usage: aggregatedUsage } : {}),
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
      text: useReasonArgs.outputs
        ? steps
            .filter((step) => step.kind !== "output")
            .map((step) => step.text)
            .filter(Boolean)
            .join("\n")
        : finalText,
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
      ...(emissions.length ? { emissions } : {}),
      ...(returned ? { returned } : {}),
      ...(interruptHistory.length > 0 ? { interruptHistory } : {}),
      ...(isLegacyInterruptContracts(interruptConfig) &&
      interruptHistory.length > 0
        ? {
            interruptResponse: interruptHistory.at(-1)?.response as TResponse,
          }
        : {}),
    } satisfies UseReasonResult<TOutput, TResponse, TContracts>;

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
        interruptCount: interruptHistory.length,
        emissionCount: emissions.length,
        ...(returned ? { returnContract: returned.contract } : {}),
      },
      telemetry: {
        ...(useReasonArgs.telemetry ?? {}),
        output:
          useReasonArgs.telemetry?.output ??
          returned?.data ??
          finalOutput ??
          finalText,
      },
    });

    ctx.currentNodeState.byKey[checkpointKey] = { status: "completed", result };
    ctx.stateDirty = true;
    return result;
  } catch (error) {
    try {
      traceSpan?.fail?.(error, {
        attributes: {
          toolStepCount: steps.length,
          toolCallCount: allToolCalls.length,
        },
      });
    } catch {
      /* Reporting must not replace the execution failure. */
    }
    throw error;
  }
};

interface ToolLoopCheckpoint {
  status: "tool_loop";
  opId: string;
  messages: KortyxPromptMessage[];
  steps: UseReasonStep[];
  pending?: RunReasonEngineResult;
  pendingStepIndex?: number;
  approvedCalls: string[];
  interruptHistory?: Array<{
    contract: string;
    request: unknown;
    response: unknown;
  }>;
  emissions?: Array<{ contract: string; data: unknown }>;
  returned?: { contract: string; data: unknown };
  finalizing?: boolean;
}
