import type {
  KortyxFinishReason,
  KortyxProviderMetadata,
  KortyxUsage,
  KortyxWarning,
} from "@kortyx/providers";
import { emitStructuredData, shouldEmitStructured } from "../structured";
import type { UseReasonArgs } from "../types";

export const mergeUsage = (
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

export const mergeWarnings = (
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

export const mergeProviderMetadata = (
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

export const emitReasonStructuredOutput = <TOutput>(args: {
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

export type ReasonResultAggregation = {
  usage?: KortyxUsage | undefined;
  finishReason?: KortyxFinishReason | undefined;
  providerMetadata?: KortyxProviderMetadata | undefined;
  warnings?: KortyxWarning[] | undefined;
};
