import type {
  KortyxFinishReason,
  KortyxProviderMetadata,
  KortyxUsage,
  KortyxWarning,
} from "@kortyx/providers";

export type ReasonTraceAttributes = Record<string, unknown>;

export type KortyxTelemetryPrompt = {
  name?: string | undefined;
  version?: string | number | undefined;
  type?: "text" | "chat" | (string & {}) | undefined;
  source?: string | undefined;
  metadata?: unknown;
};

export type KortyxTelemetryContentCapture =
  | boolean
  | {
      input?: boolean | undefined;
      output?: boolean | undefined;
    };

export type KortyxTraceMetadata = {
  operation?: string | undefined;
  prompt?: KortyxTelemetryPrompt | undefined;
  metadata?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
  input?: unknown;
  output?: unknown;
  captureContent?: KortyxTelemetryContentCapture | undefined;
};

export interface ReasonTraceSpanStartArgs {
  name: string;
  attributes?: ReasonTraceAttributes;
  telemetry?: KortyxTraceMetadata | undefined;
}

export interface ReasonTraceSpanEndArgs {
  attributes?: ReasonTraceAttributes;
  telemetry?: KortyxTraceMetadata | undefined;
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
  withSpan?: <T>(
    args: ReasonTraceSpanStartArgs,
    fn: (span: ReasonTraceSpan) => T | Promise<T>,
  ) => Promise<T>;
}

export type KortyxTraceAdapter = ReasonTraceAdapter;

export type KortyxTelemetryConfig = {
  trace?: KortyxTraceAdapter | undefined;
  metadata?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
  captureContent?: KortyxTelemetryContentCapture | undefined;
};
