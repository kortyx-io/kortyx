import type { WorkflowDefinition } from "@kortyx/core";
import { serializeFailure } from "@kortyx/core/errors";
import { describe, expect, it } from "vitest";
import { copyReducedFields, mergeWorkflowData } from "../src/graph/data";

const workflow = (
  reduce: WorkflowDefinition["reduce"],
): WorkflowDefinition => ({
  id: "reduce-test",
  version: "1",
  nodes: {},
  edges: [],
  reduce,
});

describe("workflow data accumulation", () => {
  it("ignores inherited reducer keys and undefined entries", () => {
    const reducers = Object.create({ profile: () => undefined });
    reducers.count = undefined;
    const definition = workflow(reducers);
    const merged = mergeWorkflowData(
      { profile: { name: "Ada" }, count: 1 },
      { profile: { city: "Madrid" }, count: 2 },
      definition,
    );
    expect(merged).toEqual({
      profile: { name: "Ada", city: "Madrid" },
      count: 2,
    });
    expect(
      copyReducedFields(
        { profile: { name: "Ada" } },
        {},
        { profile: {} },
        definition,
      ),
    ).toEqual({ profile: { name: "Ada" } });
  });

  it("preserves the original private exception while exposing safe failure details", () => {
    const original = new Error("private state in error message");
    const definition = workflow({
      value: () => {
        throw original;
      },
    });
    try {
      mergeWorkflowData({ value: "old" }, { value: "new" }, definition);
      throw new Error("Expected reducer failure");
    } catch (error) {
      expect(error).toMatchObject({
        code: "WORKFLOW_REDUCER_FAILED",
        cause: original,
      });
      expect(serializeFailure(error)).toMatchObject({
        context: { workflow: "reduce-test", field: "value" },
        category: "workflow",
        retryable: false,
      });
      expect(JSON.stringify(serializeFailure(error))).not.toContain(
        "private state",
      );
    }
  });

  it("rejects async reducers and drains rejected promises", async () => {
    const definition = workflow({
      value: async () => {
        throw new Error("private async failure");
      },
    });
    expect(() => mergeWorkflowData({}, { value: "new" }, definition)).toThrow(
      expect.objectContaining({ code: "WORKFLOW_REDUCER_FAILED" }),
    );
    await Promise.resolve();
  });
});
