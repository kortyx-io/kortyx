import type { WorkflowDefinition } from "@kortyx/core";
import { describe, expect, it } from "vitest";
import {
  prepareWorkflowTelemetry,
  projectWorkflowTopology,
} from "../src/telemetry/topology";

describe("projectWorkflowTopology", () => {
  it("hashes execution topology deterministically while excluding display metadata", () => {
    const base = {
      id: "support",
      version: "1.0.0",
      nodes: {
        respond: {
          run: "respond.node",
          params: { model: { provider: "google", modelId: "gemini" } },
          metadata: { label: "Respond", type: "reason" },
        },
        route: { run: "route.node", metadata: { label: "Route" } },
      },
      edges: [["route", "respond"]] as [string, string][],
      metadata: { tags: ["support", "chat"] },
    };
    const changedDisplay = {
      ...base,
      nodes: {
        ...base.nodes,
        respond: {
          ...base.nodes.respond,
          metadata: { label: "Answer customers", type: "reason" },
        },
      },
    };
    const options = { environment: "test", service: { name: "app" } };

    const first = projectWorkflowTopology({ workflow: base, ...options });
    const second = projectWorkflowTopology({
      workflow: changedDisplay,
      ...options,
    });

    expect(first.workflow.topologyHash).toBe(second.workflow.topologyHash);
    expect(first.workflow.nodes.map((node) => node.id)).toEqual([
      "respond",
      "route",
    ]);
  });

  it("changes the hash for execution changes but not ordering, versions, or tags", () => {
    const edges: WorkflowDefinition["edges"] = [
      ["route", "respond"],
      ["respond", "route", { when: "retry" }],
    ];
    const workflow = {
      id: "support",
      version: "1.0.0",
      nodes: {
        route: {
          run: "route.node",
          params: {
            threshold: 0.5,
            model: { provider: "google", modelId: "a" },
          },
          behavior: { retry: { maxAttempts: 2 } },
        },
        respond: { run: "respond.node" },
      },
      edges,
      metadata: { tags: ["a", "b"] },
    };
    const options = { environment: "test", service: { name: "app" } };
    const baseline = projectWorkflowTopology({ workflow, ...options });
    const reordered = projectWorkflowTopology({
      workflow: {
        ...workflow,
        version: "2.0.0",
        nodes: { respond: workflow.nodes.respond, route: workflow.nodes.route },
        edges: [...workflow.edges].reverse(),
        metadata: { tags: ["b", "a"] },
      },
      ...options,
    });
    const changedParams = projectWorkflowTopology({
      workflow: {
        ...workflow,
        nodes: {
          ...workflow.nodes,
          route: {
            ...workflow.nodes.route,
            params: {
              threshold: 0.8,
              model: { provider: "google", modelId: "a" },
            },
          },
        },
      },
      ...options,
    });

    expect(reordered.workflow.topologyHash).toBe(
      baseline.workflow.topologyHash,
    );
    expect(changedParams.workflow.topologyHash).not.toBe(
      baseline.workflow.topologyHash,
    );
  });

  it("fails open when an application puts non-serializable values in workflow params", () => {
    const config = {
      telemetry: {
        environment: "test",
        service: { name: "app" },
        reporter: {
          ensureWorkflowTopology: async () => ({
            workflowRevisionId: "revision",
            created: true,
          }),
          emit: async () => undefined,
        },
      },
    };
    const workflow = {
      id: "unsafe-workflow",
      version: "1",
      nodes: { unsafe: { run: "unsafe.node", params: { value: BigInt(1) } } },
      edges: [],
    };

    expect(
      prepareWorkflowTelemetry({
        config,
        workflow,
        runId: "run-1",
        sessionId: "session-1",
      }),
    ).toBe(config);
  });
});
