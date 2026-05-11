import { describe, expect, it } from "vitest";
import { getHookContext, runWithHookContext } from "../src/context";
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
      firstRun.runtimeUpdates as {
        __kortyx?: { nodeState?: { state?: { byIndex?: unknown[] } } };
      }
    ).__kortyx?.nodeState?.state?.byIndex;
    expect(byIndex).toEqual([1, true]);

    const secondState = createState(
      (firstRun.runtimeUpdates ?? {}) as Record<string, unknown>,
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

  it("persists object useNodeState values across runs", async () => {
    const { node } = createNode();
    const firstState = createState();

    const firstRun = await runWithHookContext(
      { node, state: firstState },
      async () => {
        const [state, setState] = useNodeState({ cursor: 0 });
        setState((prev) => ({ ...prev, cursor: prev.cursor + 2 }));
        return state.cursor;
      },
    );

    expect(firstRun.result).toBe(0);
    const byIndex = (
      firstRun.runtimeUpdates as {
        __kortyx?: {
          nodeState?: { state?: { byIndex?: unknown[] } };
        };
      }
    ).__kortyx?.nodeState?.state?.byIndex;
    expect(byIndex?.[0]).toEqual({ cursor: 2 });

    const secondState = createState(
      (firstRun.runtimeUpdates ?? {}) as Record<string, unknown>,
    );

    const secondRun = await runWithHookContext(
      { node, state: secondState },
      async () => {
        const [state] = useNodeState({ cursor: 0 });
        return state.cursor;
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
      firstRun.runtimeUpdates as {
        __kortyx?: { workflowState?: Record<string, unknown> };
      }
    ).__kortyx?.workflowState;
    expect(workflowState?.todos).toEqual(["item-1"]);

    const secondState = createState(
      (firstRun.runtimeUpdates ?? {}) as Record<string, unknown>,
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

  it("supports functional workflow state updates", async () => {
    const { node } = createNode();
    const state = createState();

    const run = await runWithHookContext({ node, state }, async () => {
      const [count, setCount] = useWorkflowState("count", 1);
      setCount((prev) => prev + 2);
      return count;
    });

    expect(run.result).toBe(1);
    expect(run.runtimeUpdates).toMatchObject({
      __kortyx: {
        workflowState: {
          count: 3,
        },
      },
    });
  });

  it("restores legacy array node state for the same node", async () => {
    const { node } = createNode({ nodeId: "legacy-node" });
    const state = createState({
      __kortyx: {
        nodeState: {
          nodeId: "legacy-node",
          state: ["restored"],
        },
        workflowState: {},
      },
    });

    const run = await runWithHookContext({ node, state }, async () => {
      const [value] = useNodeState("initial");
      return value;
    });

    expect(run.result).toBe("restored");
    expect(run.runtimeUpdates).toBeNull();
  });

  it("ignores malformed stored node state and initializes fresh state", async () => {
    const { node } = createNode({ nodeId: "fresh-node" });
    const state = createState({
      __kortyx: {
        nodeState: {
          nodeId: "fresh-node",
          state: "not-a-node-state",
        },
        workflowState: "not-workflow-state",
      },
    });

    const run = await runWithHookContext({ node, state }, async () => {
      const [value] = useNodeState("initial");
      return value;
    });

    expect(run.result).toBe("initial");
    expect(run.runtimeUpdates).toMatchObject({
      __kortyx: {
        nodeState: {
          nodeId: "fresh-node",
          state: { byIndex: ["initial"], byKey: {} },
        },
        workflowState: {},
      },
    });
  });

  it("throws when hook context is read outside node execution", () => {
    expect(() => getHookContext()).toThrow(
      "Hooks can only be used while a node is executing.",
    );
  });

  it("keeps node-local state scoped to the current node while workflow state is shared", async () => {
    const firstNode = createNode({ nodeId: "draft" });
    const firstState = createState();

    const firstRun = await runWithHookContext(
      { node: firstNode.node, state: firstState },
      async () => {
        const [cursor, setCursor] = useNodeState(0);
        const [todos, setTodos] = useWorkflowState<string[]>("todos", []);
        setCursor(cursor + 41);
        setTodos([...todos, "drafted"]);
        return { cursor, todos };
      },
    );

    expect(firstRun.result).toEqual({ cursor: 0, todos: [] });

    const secondNode = createNode({ nodeId: "review" });
    const secondState = createState(
      (firstRun.runtimeUpdates ?? {}) as Record<string, unknown>,
    );

    const secondRun = await runWithHookContext(
      { node: secondNode.node, state: secondState },
      async () => {
        const [cursor] = useNodeState(0);
        const [todos] = useWorkflowState<string[]>("todos", []);
        return { cursor, todos };
      },
    );

    expect(secondRun.result).toEqual({
      cursor: 0,
      todos: ["drafted"],
    });
  });

  it("isolates concurrent hook contexts across async boundaries", async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstBarrier = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondBarrier = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    const firstNode = createNode({ nodeId: "first-node" });
    const secondNode = createNode({ nodeId: "second-node" });

    const firstRun = runWithHookContext(
      { node: firstNode.node, state: createState() },
      async () => {
        await firstBarrier;
        const [count, setCount] = useNodeState(0);
        const [owner, setOwner] = useWorkflowState("owner", "");
        setCount(count + 1);
        setOwner("first");
        return { count, owner };
      },
    );

    const secondRun = runWithHookContext(
      { node: secondNode.node, state: createState() },
      async () => {
        await secondBarrier;
        const [count, setCount] = useNodeState(10);
        const [owner, setOwner] = useWorkflowState("owner", "");
        setCount(count + 1);
        setOwner("second");
        return { count, owner };
      },
    );

    releaseSecond();
    releaseFirst();

    const [first, second] = await Promise.all([firstRun, secondRun]);

    expect(first.result).toEqual({ count: 0, owner: "" });
    expect(second.result).toEqual({ count: 10, owner: "" });
    expect(first.runtimeUpdates).toMatchObject({
      __kortyx: {
        nodeState: {
          nodeId: "first-node",
          state: { byIndex: [1] },
        },
        workflowState: { owner: "first" },
      },
    });
    expect(second.runtimeUpdates).toMatchObject({
      __kortyx: {
        nodeState: {
          nodeId: "second-node",
          state: { byIndex: [11] },
        },
        workflowState: { owner: "second" },
      },
    });
  });
});
