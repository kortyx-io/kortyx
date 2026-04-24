import type {
  KortyxFinishReason,
  KortyxProviderMetadata,
  KortyxUsage,
  KortyxWarning,
} from "@kortyx/providers";

export type ReasonTraceAttributes = Record<string, unknown>;

export interface ReasonTraceSpanStartArgs {
  name: "useReason" | "runReasonEngine";
  attributes?: ReasonTraceAttributes;
}

export interface ReasonTraceSpanEndArgs {
  attributes?: ReasonTraceAttributes;
  usage?: KortyxUsage;
  finishReason?: KortyxFinishReason;
  providerMetadata?: KortyxProviderMetadata;
  warnings?: KortyxWarning[];
}

export interface ReasonTraceSpan {
  setAttributes?: (attributes: ReasonTraceAttributes) => void;
  addEvent?: (name: string, attributes?: ReasonTraceAttributes) => void;
  end?: (args?: ReasonTraceSpanEndArgs) => void;
  fail?: (error: unknown, args?: ReasonTraceSpanEndArgs) => void;
}

export interface ReasonTraceAdapter {
  startSpan: (args: ReasonTraceSpanStartArgs) => ReasonTraceSpan | undefined;
}
