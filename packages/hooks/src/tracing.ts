import type {
  KortyxFinishReason,
  KortyxProviderMetadata,
  KortyxUsage,
  KortyxWarning,
} from "@kortyx/providers";
import type {
  EnsureWorkflowTopologyRequest as ContractEnsureWorkflowTopologyRequest,
  EnsureWorkflowTopologyResponse as ContractEnsureWorkflowTopologyResponse,
  KortyxTelemetryEvent as ContractKortyxTelemetryEvent,
  KortyxTelemetryEventType as ContractKortyxTelemetryEventType,
  KortyxTelemetryService as ContractKortyxTelemetryService,
  KortyxWorkflowTopologyEdge as ContractKortyxWorkflowTopologyEdge,
  KortyxWorkflowTopologyNode as ContractKortyxWorkflowTopologyNode,
} from "@kortyx/telemetry-contracts";

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
  getActiveContext?: () =>
    | {
        traceId: string;
        spanId: string;
      }
    | undefined;
}

export type KortyxTraceAdapter = ReasonTraceAdapter;

export type KortyxTelemetryService = ContractKortyxTelemetryService;
export type KortyxWorkflowTopologyNode = ContractKortyxWorkflowTopologyNode;
export type KortyxWorkflowTopologyEdge = ContractKortyxWorkflowTopologyEdge;
export type EnsureWorkflowTopologyRequest =
  ContractEnsureWorkflowTopologyRequest;
export type EnsureWorkflowTopologyResponse =
  ContractEnsureWorkflowTopologyResponse;
export type KortyxTelemetryEventType = ContractKortyxTelemetryEventType;
export type KortyxTelemetryEvent = ContractKortyxTelemetryEvent;

/**
 * The transport boundary used by the runtime. It deliberately contains only
 * wire contracts so applications can provide a custom transport without
 * coupling the SDK to a particular HTTP client or queue.
 */
export interface KortyxTelemetryReporter {
  ensureWorkflowTopology: (
    snapshot: EnsureWorkflowTopologyRequest,
  ) => Promise<EnsureWorkflowTopologyResponse>;
  emit: (events: KortyxTelemetryEvent[]) => Promise<void>;
  getWorkflowRevisionId?: (
    args: Pick<EnsureWorkflowTopologyRequest, "environment"> & {
      workflowId: string;
      topologyHash: string;
    },
  ) => string | undefined;
}

export type KortyxTelemetryCorrelation = {
  runId?: string | undefined;
  sessionId?: string | undefined;
  workflowId?: string | undefined;
  workflowRevisionId?: string | undefined;
  topologyHash?: string | undefined;
  nodeId?: string | undefined;
};

export type KortyxTelemetryConfig = {
  trace?: KortyxTraceAdapter | undefined;
  reporter?: KortyxTelemetryReporter | undefined;
  environment?: string | undefined;
  service?: KortyxTelemetryService | undefined;
  /** Runtime-owned correlation populated while a workflow is resolved. */
  correlation?: KortyxTelemetryCorrelation | undefined;
  metadata?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
  captureContent?: KortyxTelemetryContentCapture | undefined;
};
