import { createHash } from "node:crypto";
import type { WorkflowDefinition } from "@kortyx/core";
import type {
  EnsureWorkflowTopologyRequest,
  KortyxTelemetryConfig,
} from "@kortyx/hooks";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => typeof nested !== "function")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const metadata = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? (stableValue(value) as Record<string, unknown>) : undefined;

const tagsFrom = (workflow: WorkflowDefinition): string[] | undefined => {
  const raw = isRecord(workflow.metadata) ? workflow.metadata.tags : undefined;
  if (!Array.isArray(raw)) return undefined;
  const tags = raw
    .filter((tag): tag is string => typeof tag === "string")
    .sort();
  return tags.length > 0 ? tags : undefined;
};

/** Produces the topology-only, deterministic Contract A snapshot. */
export const projectWorkflowTopology = (args: {
  workflow: WorkflowDefinition;
  environment: string;
  service: NonNullable<KortyxTelemetryConfig["service"]>;
}): EnsureWorkflowTopologyRequest => {
  const nodes = Object.entries(args.workflow.nodes)
    .map(([id, node]) => {
      const nodeMetadata = metadata(node.metadata);
      const params = metadata(node.params);
      const model = isRecord(node.params?.model)
        ? node.params.model
        : undefined;
      const provider = isRecord(model)
        ? (asString(model.provider) ?? asString(model.providerId))
        : undefined;
      const modelName = isRecord(model)
        ? (asString(model.name) ?? asString(model.modelId))
        : undefined;
      return {
        id,
        ...(asString(nodeMetadata?.label)
          ? { label: asString(nodeMetadata?.label) }
          : {}),
        ...(asString(nodeMetadata?.type)
          ? { type: asString(nodeMetadata?.type) }
          : {}),
        ...(provider ? { provider } : {}),
        ...(modelName ? { model: modelName } : {}),
        ...(nodeMetadata ? { metadata: nodeMetadata } : {}),
        // These fields feed the hash but are intentionally not sent as Studio
        // display metadata. They are stripped below after hashing.
        _execution: {
          ...(typeof node.run === "string" ? { run: node.run } : {}),
          ...(params ? { params } : {}),
          ...(node.behavior ? { behavior: stableValue(node.behavior) } : {}),
        },
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = args.workflow.edges
    .map((edge) => ({
      sourceNodeId: edge[0],
      targetNodeId: edge[1],
      ...(edge[2]?.when ? { condition: edge[2].when } : {}),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const tags = tagsFrom(args.workflow);
  const hashInput = stableValue({
    workflowId: args.workflow.id,
    nodes: nodes.map((node) => ({ id: node.id, ...node._execution })),
    edges,
  });
  const topologyHash = createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex");

  return {
    schemaVersion: 1,
    environment: args.environment,
    service: args.service,
    workflow: {
      id: args.workflow.id,
      declaredVersion: args.workflow.version,
      ...(args.workflow.description
        ? { description: args.workflow.description }
        : {}),
      ...(tags ? { tags } : {}),
      topologyHash,
      nodes: nodes.map(({ _execution: _ignored, ...node }) => node),
      edges,
    },
  };
};

/**
 * Starts topology registration without adding latency to workflow execution.
 * A hot adapter cache yields a revision ID; a cold run carries topologyHash so
 * the API can backfill correlation when the asynchronous ensure finishes.
 */
export const prepareWorkflowTelemetry = (args: {
  config: Record<string, unknown>;
  workflow: WorkflowDefinition;
  runId: string;
  sessionId?: string | undefined;
}): Record<string, unknown> => {
  const telemetry = isRecord(args.config.telemetry)
    ? (args.config.telemetry as KortyxTelemetryConfig)
    : undefined;
  if (!telemetry?.reporter || !telemetry.environment || !telemetry.service) {
    return args.config;
  }

  let snapshot: EnsureWorkflowTopologyRequest;
  try {
    snapshot = projectWorkflowTopology({
      workflow: args.workflow,
      environment: telemetry.environment,
      service: telemetry.service,
    });
  } catch {
    // An application may put non-serializable values in node params. That is
    // invalid telemetry input, but it must never prevent workflow execution.
    return args.config;
  }
  let workflowRevisionId: string | undefined;
  try {
    workflowRevisionId = telemetry.reporter.getWorkflowRevisionId?.({
      environment: snapshot.environment,
      workflowId: snapshot.workflow.id,
      topologyHash: snapshot.workflow.topologyHash,
    });
    void Promise.resolve(
      telemetry.reporter.ensureWorkflowTopology(snapshot),
    ).catch(() => {
      // Telemetry is best effort. The run still contains a topology hash for
      // a later API-side backfill when the transport becomes available.
    });
  } catch {
    // Do not allow a custom reporter that throws synchronously to stop a run.
  }

  return {
    ...args.config,
    telemetry: {
      ...telemetry,
      correlation: {
        ...(telemetry.correlation ?? {}),
        runId: args.runId,
        ...(args.sessionId ? { sessionId: args.sessionId } : {}),
        workflowId: snapshot.workflow.id,
        topologyHash: snapshot.workflow.topologyHash,
        ...(workflowRevisionId ? { workflowRevisionId } : {}),
      },
    } satisfies KortyxTelemetryConfig,
  };
};
