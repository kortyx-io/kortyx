import { describe, expect, it } from "vitest";
import { createEventMapper } from "../src/event-mapper";

const mapper = createEventMapper({
  environment: "test",
  service: { name: "app" },
  createId: () => "id",
});
describe("child workflow span ownership", () => {
  it("does not inherit a parent's workflow revision, topology, or node into a child", () => {
    const parent = {
      traceId: "trace",
      spanId: "parent",
      correlation: {
        runId: "run",
        workflowId: "parent",
        workflowRevisionId: "parent-rev",
        topologyHash: "a".repeat(64),
        nodeId: "caller",
        branchId: "fork",
      },
    };
    const child = mapper.correlationFrom(
      { workflowId: "child", invocationId: "invocation" },
      parent,
    );
    expect(child).toEqual({
      runId: "run",
      workflowId: "child",
      invocationId: "invocation",
      branchId: "fork",
    });
    const node = mapper.correlationFrom(
      {
        workflowId: "child",
        workflowRevisionId: "child-rev",
        nodeId: "research",
      },
      { traceId: "trace", spanId: "child", correlation: child! },
    );
    const generation = mapper.correlationFrom(
      {},
      { traceId: "trace", spanId: "node", correlation: node! },
    );
    expect(generation).toMatchObject({
      workflowRevisionId: "child-rev",
      nodeId: "research",
      invocationId: "invocation",
      branchId: "fork",
    });
    expect(
      mapper.createEvent({
        type: "generation.completed",
        correlation: generation!,
        payload: { usage: { totalTokens: 10 } },
      }).payload,
    ).toMatchObject({ invocationId: "invocation", branchId: "fork" });
  });
});
