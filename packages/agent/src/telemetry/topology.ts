import { createHash } from "node:crypto";
import type { WorkflowDefinition } from "@kortyx/core";
import type {
  EnsureWorkflowTopologyRequest,
  KortyxTelemetryConfig,
} from "@kortyx/hooks";

type WorkflowTopologyTransition = NonNullable<
  EnsureWorkflowTopologyRequest["workflow"]["transitions"]
>[number];

type WorkflowTopologyNodeInput = {
  run?: unknown;
  params?: unknown;
  metadata?: unknown;
  behavior?: unknown;
};

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

const wordsFrom = (value: string): string[] =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);

const camelFromWorkflowId = (workflowId: string): string => {
  const [first = "", ...rest] = wordsFrom(workflowId);
  return [
    first,
    ...rest.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`),
  ].join("");
};

const resolveMemberTransitionTarget = (
  memberName: string,
  knownWorkflowIds: readonly string[],
): string | undefined => {
  const exact = knownWorkflowIds.find(
    (workflowId) => camelFromWorkflowId(workflowId) === memberName,
  );
  if (exact) return exact;

  const memberWords = new Set(wordsFrom(memberName));
  const candidates = knownWorkflowIds
    .map((workflowId) => {
      const workflowWords = wordsFrom(workflowId);
      const matched = workflowWords.filter((word) => memberWords.has(word));
      return {
        workflowId,
        matched: matched.length,
        total: workflowWords.length,
      };
    })
    .filter(
      (candidate) =>
        candidate.total > 0 && candidate.matched === candidate.total,
    )
    .sort(
      (a, b) =>
        b.matched - a.matched || a.workflowId.localeCompare(b.workflowId),
    );

  if (candidates.length !== 1) return undefined;
  return candidates[0]?.workflowId;
};

const transitionTargetsFromRun = (
  run: unknown,
  knownWorkflowIds: readonly string[],
): string[] => {
  if (typeof run !== "function") return [];

  const source = Function.prototype.toString.call(run);
  const targets = new Set<string>();

  for (const match of source.matchAll(
    /\btransitionTo\s*:\s*(['"`])([^'"`$]+)\1/g,
  )) {
    const target = match[2]?.trim();
    if (target) targets.add(target);
  }

  for (const match of source.matchAll(
    /\btransitionTo\s*:\s*(?:[A-Za-z_$][\w$]*\.)+([A-Za-z_$][\w$]*)/g,
  )) {
    const memberName = match[1] as string;
    const target = resolveMemberTransitionTarget(memberName, knownWorkflowIds);
    if (target) targets.add(target);
  }

  for (const match of source.matchAll(
    /\btransitionTo\s*:\s*(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*\[['"`]([A-Za-z_$][\w$]*)['"`]\]/g,
  )) {
    const memberName = match[1] as string;
    const target = resolveMemberTransitionTarget(memberName, knownWorkflowIds);
    if (target) targets.add(target);
  }

  return [...targets].sort();
};

const transitionsFromNodes = (
  workflow: WorkflowDefinition,
  knownWorkflowIds: readonly string[],
): WorkflowTopologyTransition[] => {
  const transitions = new Map<string, WorkflowTopologyTransition>();

  for (const [sourceNodeId, node] of Object.entries(
    workflow.nodes as Record<string, WorkflowTopologyNodeInput>,
  )) {
    for (const targetWorkflowId of transitionTargetsFromRun(
      node.run,
      knownWorkflowIds,
    )) {
      if (targetWorkflowId === workflow.id) continue;
      const key = `${sourceNodeId}:${targetWorkflowId}`;
      transitions.set(key, { sourceNodeId, targetWorkflowId });
    }
  }

  return [...transitions.values()].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
};

/** Produces the topology-only, deterministic Contract A snapshot. */
export const projectWorkflowTopology = (args: {
  workflow: WorkflowDefinition;
  environment: string;
  service: NonNullable<KortyxTelemetryConfig["service"]>;
  knownWorkflowIds?: readonly string[] | undefined;
}): EnsureWorkflowTopologyRequest => {
  const nodes = Object.entries(
    args.workflow.nodes as Record<string, WorkflowTopologyNodeInput>,
  )
    .map(([id, node]) => {
      const nodeMetadata = metadata(node.metadata);
      const params = metadata(node.params);
      const model = isRecord(node.params)
        ? isRecord(node.params.model)
          ? node.params.model
          : undefined
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
    .map((edge) => {
      const condition = isRecord(edge[2]) ? asString(edge[2].when) : undefined;
      return {
        sourceNodeId: edge[0],
        targetNodeId: edge[1],
        ...(condition ? { condition } : {}),
      };
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const transitions = transitionsFromNodes(
    args.workflow,
    args.knownWorkflowIds ?? [],
  );
  const tags = tagsFrom(args.workflow);
  const hashInput = stableValue({
    workflowId: args.workflow.id,
    nodes: nodes.map((node) => ({ id: node.id, ...node._execution })),
    edges,
    transitions,
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
      ...(transitions.length > 0 ? { transitions } : {}),
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
  knownWorkflowIds?: readonly string[] | undefined;
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
      knownWorkflowIds: args.knownWorkflowIds,
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
