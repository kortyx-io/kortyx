import { randomUUID } from "node:crypto";
import type { ProviderModelRef } from "@kortyx/providers";
import { getHookContext } from "../context";
import type { RunReasonEngineResult } from "../reason-engine";
import { runReasonEngine } from "../reason-engine";

export type ReasonEngineInput = {
  model: ProviderModelRef;
  input: string;
  system?: string | undefined;
  temperature?: number | undefined;
  emit?: boolean | undefined;
  stream?: boolean | undefined;
  onTextChunk?: ((text: string) => void) | undefined;
};

export const createRuntimeId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

export async function reasonEngine(
  args: ReasonEngineInput,
  meta: { id?: string; opId: string },
  inputOverride?: string,
): Promise<RunReasonEngineResult> {
  const ctx = getHookContext();

  return runReasonEngine({
    model: args.model,
    input: inputOverride ?? args.input,
    system: args.system,
    temperature: args.temperature,
    defaultTemperature: ctx.node.config?.model?.temperature,
    stream: args.stream,
    emit: args.emit,
    onTextChunk: args.onTextChunk,
    nodeId: ctx.node.graph.node,
    emitEvent: ctx.node.emit,
    id: meta.id,
    opId: meta.opId,
  });
}
