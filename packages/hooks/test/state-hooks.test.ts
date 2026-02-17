import { describe, expect, it } from "vitest";
import { runWithHookContext } from "../src/context";
import { useNodeState, useWorkflowState } from "../src/hooks";
import { createNode, createState } from "./helpers";

describe("state hooks", () => {
  it("persists positional useNodeState values across runs", async () => {
    const { node } = createNode();
    const firstState = createState();

    const firstRun = await runWithHookContext(
      { node, state: firstState },
      async () => {
        const [count, setCount] = useNodeState(0);
        const [ready, setReady] = useNodeState(false);
        setCount((prev) => prev + 1);
        setReady(true);
        return { count, ready };
      },
    );

    expect(firstRun.result).toEqual({ count: 0, ready: false });
    const byIndex = (
      firstRun.memoryUpdates as {
        __kortyx?: { nodeState?: { state?: { byIndex?: unknown[] } } };
      }
    ).__kortyx?.nodeState?.state?.byIndex;
    expect(byIndex).toEqual([1, true]);

    const secondState = createState(
      (firstRun.memoryUpdates ?? {}) as Record<string, unknown>,
    );

    const secondRun = await runWithHookContext(
      { node, state: secondState },
      async () => {
        const [count] = useNodeState(0);
        const [ready] = useNodeState(false);
        return { count, ready };
      },
    );

    expect(secondRun.result).toEqual({ count: 1, ready: true });
  });

  it("persists keyed useNodeState values across runs", async () => {
    const { node } = createNode();
    const firstState = createState();

    const firstRun = await runWithHookContext(
      { node, state: firstState },
      async () => {
        const [cursor, setCursor] = useNodeState("cursor", 0);
        setCursor(cursor + 2);
        return cursor;
      },
    );

    expect(firstRun.result).toBe(0);
    const byKey = (
      firstRun.memoryUpdates as {
        __kortyx?: {
          nodeState?: { state?: { byKey?: Record<string, unknown> } };
        };
      }
    ).__kortyx?.nodeState?.state?.byKey;
    expect(byKey?.cursor).toBe(2);

    const secondState = createState(
      (firstRun.memoryUpdates ?? {}) as Record<string, unknown>,
    );

    const secondRun = await runWithHookContext(
      { node, state: secondState },
      async () => {
        const [cursor] = useNodeState("cursor", 0);
        return cursor;
      },
    );

    expect(secondRun.result).toBe(2);
  });

  it("persists useWorkflowState values across runs", async () => {
    const { node } = createNode();
    const firstState = createState();

    const firstRun = await runWithHookContext(
      { node, state: firstState },
      async () => {
        const [todos, setTodos] = useWorkflowState<string[]>("todos", []);
        setTodos([...todos, "item-1"]);
        return todos;
      },
    );

    expect(firstRun.result).toEqual([]);
    const workflowState = (
      firstRun.memoryUpdates as {
        __kortyx?: { workflowState?: Record<string, unknown> };
      }
    ).__kortyx?.workflowState;
    expect(workflowState?.todos).toEqual(["item-1"]);

    const secondState = createState(
      (firstRun.memoryUpdates ?? {}) as Record<string, unknown>,
    );

    const secondRun = await runWithHookContext(
      { node, state: secondState },
      async () => {
        const [todos] = useWorkflowState<string[]>("todos", []);
        return todos;
      },
    );

    expect(secondRun.result).toEqual(["item-1"]);
  });
});
