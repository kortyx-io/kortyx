import { describe, expect, it } from "vitest";
import type { WorkflowSystem, WorkflowTransition } from "../schema";
import { withWorkflowCallEvidence } from "./workflow-calls";

const path: WorkflowTransition = {
  id: "catalog-call:parent:chat:child",
  kind: "call",
  sourceWorkflowId: "parent",
  sourceNodeId: "chat",
  targetWorkflowId: "child",
  volume: 0,
};
const system: WorkflowSystem = {
  workflows: [],
  transitions: [path],
  cohort: { range: "All time", startedAfter: null, startedBefore: null },
  observedCalls: [
    {
      ...path,
      id: "observed-call:parent:chat:child",
      volume: 3,
      runId: "run",
      branchId: "branch",
      invocationId: "invocation",
    },
  ],
};
describe("workflow call evidence", () => {
  it("keeps the catalog connected without traffic or with observations hidden", () => {
    expect(
      withWorkflowCallEvidence({ ...system, observedCalls: [] }, true)
        .transitions,
    ).toEqual([path]);
    expect(withWorkflowCallEvidence(system, false).transitions).toEqual([path]);
  });
  it("overlays observed metrics without duplicating a source-discovered call", () => {
    expect(withWorkflowCallEvidence(system, true).transitions).toEqual([
      expect.objectContaining({ id: path.id, kind: "call", volume: 3 }),
    ]);
  });
  it("keeps handoffs distinct and adds dynamically observed targets", () => {
    const handoff = { ...path, id: "handoff", kind: "handoff" as const };
    const dynamic = {
      ...system.observedCalls![0]!,
      id: "observed-call:parent:chat:dynamic",
      targetWorkflowId: "dynamic",
    };
    const result = withWorkflowCallEvidence(
      {
        ...system,
        transitions: [path, handoff],
        observedCalls: [...system.observedCalls!, dynamic],
      },
      true,
    );
    expect(result.transitions).toHaveLength(3);
    expect(result.transitions[1]).toEqual(handoff);
    expect(result.transitions[2]).toMatchObject({
      targetWorkflowId: "dynamic",
      kind: "call",
    });
  });
});
