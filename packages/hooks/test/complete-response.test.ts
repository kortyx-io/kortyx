// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks.
import { expect, it, vi } from "vitest";
import { completeResponse } from "../src/complete-response";
import { runWithHookContext } from "../src/context";
import { useNodeState, useWorkflowState } from "../src/hooks";
import { createNode, createState } from "./helpers";

it("validates payloads and requires an agent-managed root context", async () => {
  await expect(completeResponse()).rejects.toThrow("node is executing");
  await runWithHookContext(
    { node: createNode().node, state: createState() },
    async () => {
      await expect(completeResponse()).rejects.toThrow("agent-managed root");
      await expect(
        completeResponse({ data: { invalid: Number.NaN } }),
      ).rejects.toThrow();
      await expect(
        completeResponse({ unexpected: true } as never),
      ).rejects.toThrow();
    },
  );
});
it("passes empty or explicit output and snapshots hook state already written in the active node", async () => {
  const finalize = vi.fn(async (_options: unknown, _state: unknown) => {});
  const { node } = createNode({ nodeId: "close" });
  await runWithHookContext(
    { node: { ...node, completeResponse: finalize }, state: createState() },
    async () => {
      await completeResponse();
      const [, setNode] = useNodeState("initial");
      setNode("saved");
      const [, setWorkflow] = useWorkflowState("key", 1);
      setWorkflow(2);
      await completeResponse({ message: "done", data: { ok: true } });
    },
  );
  expect(finalize.mock.calls[0]![0]).toEqual({});
  expect(finalize.mock.calls[1]).toMatchObject([
    { message: "done", data: { ok: true } },
    {
      lastNode: "close",
      runtime: {
        __kortyx: {
          workflowState: { key: 2 },
          nodeState: { state: { byIndex: ["saved"] } },
        },
      },
    },
  ]);
});
