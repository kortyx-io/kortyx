import type {
  EnsureWorkflowTopologyRequest,
  EnsureWorkflowTopologyResponse,
} from "@kortyx/hooks";

type TopologyKey = {
  environment: string;
  workflowId: string;
  topologyHash: string;
};

const keyFor = ({ environment, workflowId, topologyHash }: TopologyKey) =>
  `${environment}:${workflowId}:${topologyHash}`;

/** Caches successful topology ensures and coalesces concurrent requests. */
export const createTopologyResolver = (args: {
  ensure: (
    snapshot: EnsureWorkflowTopologyRequest,
  ) => Promise<EnsureWorkflowTopologyResponse>;
}) => {
  const revisions = new Map<string, string>();
  const pending = new Map<string, Promise<EnsureWorkflowTopologyResponse>>();

  const ensureWorkflowTopology = (
    snapshot: EnsureWorkflowTopologyRequest,
  ): Promise<EnsureWorkflowTopologyResponse> => {
    const key = keyFor({
      environment: snapshot.environment,
      workflowId: snapshot.workflow.id,
      topologyHash: snapshot.workflow.topologyHash,
    });
    const revision = revisions.get(key);
    if (revision) {
      return Promise.resolve({ workflowRevisionId: revision, created: false });
    }

    const existing = pending.get(key);
    if (existing) return existing;

    const request = args
      .ensure(snapshot)
      .then((result) => {
        if (!result.workflowRevisionId) {
          throw new Error(
            "Telemetry API returned an invalid workflow revision.",
          );
        }
        revisions.set(key, result.workflowRevisionId);
        return result;
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, request);
    return request;
  };

  return {
    ensureWorkflowTopology,
    getWorkflowRevisionId: (args: TopologyKey) => revisions.get(keyFor(args)),
  };
};
