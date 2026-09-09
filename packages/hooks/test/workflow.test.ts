// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks execute in a server node context.
import { describe, expect, it, vi } from "vitest";
import { runWithHookContext } from "../src/context";
import { useWorkflow, workflowCallFingerprint } from "../src/workflow";
import { createNode, createState } from "./helpers";

describe("workflow call identity", () => {
  it("canonicalizes nested JSON without rejecting shared references", () => {
    const shared = { value: [true, null, 3] };
    expect(workflowCallFingerprint({ b: shared, a: shared })).toBe(
      workflowCallFingerprint({ a: shared, b: shared }),
    );
  });

  it.each([
    undefined,
    NaN,
    Infinity,
    1n,
    () => {},
    new Date(),
    new Map(),
  ])("rejects non-JSON input %s", (value) => {
    expect(() => workflowCallFingerprint(value)).toThrow(
      "Workflow input and output",
    );
  });

  it("rejects circular input", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => workflowCallFingerprint(value)).toThrow("JSON serializable");
  });

  it("requires a node registry and a stable id", async () => {
    await expect(
      useWorkflow({ id: "call", workflow: "child", input: {} }),
    ).rejects.toThrow("while a node");
    const { node } = createNode();
    await expect(
      runWithHookContext({ node, state: createState() }, () =>
        useWorkflow({ id: "call", workflow: "child", input: {} }),
      ),
    ).rejects.toThrow("registry");
    node.callWorkflow = vi.fn(async () => ({
      status: "completed" as const,
      data: {},
    }));
    await expect(
      runWithHookContext({ node, state: createState() }, () =>
        useWorkflow({ id: " ", workflow: "child", input: {} }),
      ),
    ).rejects.toThrow("nonempty");
  });

  it("rejects overlapping calls and bounds repeated calls within a node", async () => {
    const { node } = createNode();
    node.callWorkflow = async () => ({
      status: "completed" as const,
      data: { value: "result" },
    });
    await runWithHookContext({ node, state: createState() }, async () => {
      const first = useWorkflow({ id: "first", workflow: "child", input: {} });
      await expect(
        useWorkflow({ id: "second", workflow: "child", input: {} }),
      ).rejects.toThrow("Concurrent");
      await first;
    });
    await expect(
      runWithHookContext({ node, state: createState() }, async () => {
        for (let i = 0; i < 65; i++)
          await useWorkflow({ id: String(i), workflow: "child", input: {} });
      }),
    ).rejects.toThrow("at most 64");
  });
});
