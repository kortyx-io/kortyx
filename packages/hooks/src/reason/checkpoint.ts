import type { InterruptInput } from "@kortyx/core";
import type {
  KortyxFinishReason,
  KortyxProviderMetadata,
  KortyxUsage,
  KortyxWarning,
} from "@kortyx/providers";

export type ReasonInterruptCheckpoint = {
  status: "awaiting_interrupt";
  request: InterruptInput;
  firstText: string;
  firstRaw?: unknown;
  firstUsage?: KortyxUsage;
  firstFinishReason?: KortyxFinishReason;
  firstProviderMetadata?: KortyxProviderMetadata;
  firstWarnings?: KortyxWarning[];
  firstOutput?: unknown;
};

export const resolveReasonCheckpointKey = (args: {
  id?: string;
  autoIndex: number;
}): string =>
  typeof args.id === "string" && args.id.length > 0
    ? `__useReason:${args.id}`
    : `__useReason:auto:${args.autoIndex}`;

export const readReasonCheckpoint = (
  raw: unknown,
): ReasonInterruptCheckpoint | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (value.status !== "awaiting_interrupt") return undefined;
  if (typeof value.firstText !== "string") return undefined;
  if (!value.request || typeof value.request !== "object") return undefined;
  return {
    status: "awaiting_interrupt",
    request: value.request as InterruptInput,
    firstText: value.firstText,
    ...(Object.hasOwn(value, "firstRaw") ? { firstRaw: value.firstRaw } : {}),
    ...(Object.hasOwn(value, "firstUsage")
      ? { firstUsage: value.firstUsage as KortyxUsage }
      : {}),
    ...(Object.hasOwn(value, "firstFinishReason")
      ? { firstFinishReason: value.firstFinishReason as KortyxFinishReason }
      : {}),
    ...(Object.hasOwn(value, "firstProviderMetadata")
      ? {
          firstProviderMetadata:
            value.firstProviderMetadata as KortyxProviderMetadata,
        }
      : {}),
    ...(Object.hasOwn(value, "firstWarnings")
      ? { firstWarnings: value.firstWarnings as KortyxWarning[] }
      : {}),
    ...(Object.hasOwn(value, "firstOutput")
      ? { firstOutput: value.firstOutput }
      : {}),
  };
};

export const resolveHookStatePatch = (args: {
  nodeId: string;
  currentNodeState: unknown;
  workflowState: Record<string, unknown>;
}): Record<string, unknown> => ({
  __kortyx: {
    nodeState: {
      nodeId: args.nodeId,
      state: args.currentNodeState,
    },
    workflowState: args.workflowState,
  },
});
