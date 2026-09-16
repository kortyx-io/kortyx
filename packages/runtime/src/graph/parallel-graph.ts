import type {
  GraphState,
  InterruptInput,
  TokenUsage,
  WorkflowDefinition,
} from "@kortyx/core";
import {
  isExecutionCancelled,
  isExecutionLimitReached,
  throwIfExecutionAborted,
} from "@kortyx/core";
import {
  errorFromFailure,
  type FailureDescriptor,
  KortyxError,
  serializeFailure,
  WorkflowContractError,
} from "@kortyx/core/errors";
import { deepMergeWithArrayOverwrite } from "@kortyx/utils";
import {
  GraphInterrupt,
  interrupt,
  isGraphInterrupt,
} from "@langchain/langgraph";
import type {
  ExecutionControl,
  ExecutionRuntimeConfig,
} from "./create-execution-graph";

export type NodeExecutor = (
  state: GraphState,
  awaitInput?: (request: InterruptInput) => unknown,
  snapshotGraph?: (nodeState: GraphState) => GraphState,
) => Promise<Record<string, unknown>>;

const WORK = "__kortyx_parallel_work";
const WAIT = "__kortyx_parallel_wait";
const FINISH = "__kortyx_parallel_finish";
const KEY = "__kortyxParallelGraph";
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const zeroUsage = (): TokenUsage => ({ input: 0, output: 0, total: 0 });

type Field = { writer: string; value: unknown };
type Fields = Record<string, Field>;
type NodeRecord = {
  id: string;
  ancestors: string[];
  status:
    | "pending"
    | "running"
    | "waiting"
    | "limited"
    | "completed"
    | "failed"
    | "skipped";
  responses: unknown[];
  runtime: Record<string, unknown>;
  fields: Fields;
  workflowFields: Fields;
  runtimeFields: Fields;
  selected: string[];
  request?: InterruptInput;
  failure?: FailureDescriptor;
  history?: GraphState["conversationHistory"];
};
type Journal = {
  version: 1;
  runId?: string | undefined;
  workflowVersion: string;
  initialInput: unknown;
  initialData: Record<string, unknown>;
  initialRuntime: Record<string, unknown>;
  nodes: Record<string, NodeRecord>;
  waitingNode?: string | undefined;
};
type Builder = {
  addNode: (
    id: string,
    fn: (
      state: GraphState,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>,
  ) => unknown;
  addEdge: (from: string, to: string) => unknown;
  addConditionalEdges: (
    from: string,
    fn: (state: GraphState) => string,
    mapping: Record<string, string>,
  ) => unknown;
};

export function hasParallelEdges(workflow: WorkflowDefinition): boolean {
  const groups = new Map<string, { plain: number; conditional: number }>();
  for (const [from, , condition] of workflow.edges) {
    const group = groups.get(from) ?? { plain: 0, conditional: 0 };
    if (condition?.when) group.conditional++;
    else group.plain++;
    groups.set(from, group);
    if (group.plain > 1 || (group.plain && group.conditional)) return true;
  }
  return false;
}

/** The root engine owns checkpoints; node activations own their replay journals. */
export function addParallelGraphCoordinator(
  builder: Builder,
  workflow: WorkflowDefinition,
  config: ExecutionRuntimeConfig,
  execution: ExecutionControl,
  executors: Record<string, NodeExecutor>,
): void {
  const ids = [...Object.keys(workflow.nodes), "__end__"];
  const incoming = new Map(ids.map((id) => [id, [] as string[]]));
  const outgoing = new Map<string, Array<{ to: string; when?: string }>>();
  for (const [from, to, condition] of workflow.edges) {
    if (
      from === "__end__" ||
      to === "__start__" ||
      (from !== "__start__" && !Object.hasOwn(workflow.nodes, from)) ||
      !incoming.has(to)
    )
      throw new WorkflowContractError(
        `Invalid parallel graph edge '${from}' → '${to}'.`,
      );
    if (!incoming.get(to)?.includes(from)) incoming.get(to)?.push(from);
    const edges = outgoing.get(from) ?? [];
    if (!edges.some((edge) => edge.to === to && edge.when === condition?.when))
      edges.push({ to, ...(condition ? { when: condition.when } : {}) });
    outgoing.set(from, edges);
  }
  const ancestors = new Map<string, Set<string>>([["__start__", new Set()]]);
  const remaining = new Set(ids);
  const ordered: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((id) =>
      incoming.get(id)?.every((from) => ancestors.has(from)),
    );
    if (!ready.length)
      throw new KortyxError(
        "GRAPH_CYCLE",
        "Parallel graph back-edges are not supported: use a sequential child workflow for loops.",
        {
          category: "workflow",
          retryable: false,
          safeMessage:
            "Parallel graph back-edges are not supported: use a sequential child workflow for loops.",
        },
      );
    for (const id of ready) {
      const parents = incoming.get(id) ?? [];
      ancestors.set(
        id,
        new Set(
          parents.flatMap((from) => [from, ...(ancestors.get(from) ?? [])]),
        ),
      );
      remaining.delete(id);
      ordered.push(id);
    }
  }
  ids.splice(0, ids.length, ...ordered);

  const failure = (
    code: string,
    message: string,
    node: string,
    cause?: unknown,
  ) =>
    new KortyxError(code, message, {
      category: "workflow",
      retryable: false,
      safeMessage: message,
      context: { workflow: workflow.id, node },
      ...(cause ? { cause } : {}),
    });
  const mergeFields = (
    parents: NodeRecord[],
    node: string,
    property: "fields" | "workflowFields" | "runtimeFields",
    journal: Journal,
  ): Fields => {
    const merged: Fields = {};
    for (const parent of parents) {
      for (const [key, field] of Object.entries(parent[property])) {
        const previous = Object.hasOwn(merged, key) ? merged[key] : undefined;
        if (previous && previous.writer !== field.writer) {
          if (journal.nodes[previous.writer]?.ancestors.includes(field.writer))
            continue;
          if (!journal.nodes[field.writer]?.ancestors.includes(previous.writer))
            throw failure(
              "GRAPH_OUTPUT_CONFLICT",
              `Node '${node}' cannot combine ${property === "fields" ? "data" : property === "workflowFields" ? "workflow state" : "runtime"} field '${key}': branches '${previous.writer}' and '${field.writer}' both wrote it. Return separate fields in application logic.`,
              node,
            );
        }
        Object.defineProperty(merged, key, {
          value: field,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    return merged;
  };
  const values = (fields: Fields) =>
    Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, field.value]),
    );
  const initialWorkflowState = (journal: Journal) => {
    const internal = journal.initialRuntime.__kortyx;
    return record(internal) && record(internal.workflowState)
      ? internal.workflowState
      : {};
  };
  const usage = (journal: Journal) => {
    const total = {
      ...zeroUsage(),
      ...(journal.initialRuntime.tokenUsage as TokenUsage | undefined),
    };
    for (const node of Object.values(journal.nodes)) {
      const used = node.runtime.tokenUsage as TokenUsage | undefined;
      if (used)
        for (const key of ["input", "output", "total"] as const)
          total[key] += used[key] ?? 0;
    }
    return total;
  };
  const runtimePatch = (journal: Journal) => ({
    [KEY]: journal,
    tokenUsage: usage(journal),
  });
  const load = (state: GraphState): Journal => {
    const saved = (state.runtime as Record<string, unknown>)[KEY];
    if (
      saved &&
      (config.resume === true ||
        !config.executionRunId ||
        (saved as Journal).runId === config.executionRunId)
    ) {
      const journal = clone(saved) as Journal;
      if (journal.version !== 1 || journal.workflowVersion !== workflow.version)
        throw new WorkflowContractError(
          "Parallel workflow changed since its execution was suspended.",
        );
      return journal;
    }
    const initialRuntime = clone(state.runtime) as Record<string, unknown>;
    delete initialRuntime[KEY];
    return {
      version: 1,
      runId: config.executionRunId,
      workflowVersion: workflow.version,
      initialInput: state.input,
      initialData: clone(state.data ?? {}),
      initialRuntime,
      nodes: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            id,
            ancestors: [],
            status: "pending",
            responses: [],
            runtime: {},
            fields: {},
            workflowFields: {},
            runtimeFields: {},
            selected: [],
          },
        ]),
      ),
    };
  };
  const terminal = (node: NodeRecord) =>
    ["completed", "failed", "skipped"].includes(node.status);

  builder.addNode(WORK, async (state) => {
    const journal = load(state);
    let control: unknown;
    const running = new Map<string, Promise<void>>();
    // Continue re-admits only the limited activations; waiting siblings remain waiting.
    for (const node of Object.values(journal.nodes))
      if (node.status === "limited") node.status = "pending";
    const start = async (id: string, parents: NodeRecord[]) => {
      const node = journal.nodes[id] as NodeRecord;
      let privateState: GraphState | undefined;
      try {
        node.ancestors = [
          ...new Set(
            parents.flatMap((parent) => [parent.id, ...parent.ancestors]),
          ),
        ];
        const failed = parents.find((parent) => parent.status === "failed");
        if (failed)
          throw failure(
            "GRAPH_DEPENDENCY_FAILED",
            `Node '${id}' did not run because required dependency '${failed.id}' failed.`,
            id,
            failed.failure,
          );
        node.fields = mergeFields(parents, id, "fields", journal);
        node.workflowFields = mergeFields(
          parents,
          id,
          "workflowFields",
          journal,
        );
        node.runtimeFields = mergeFields(parents, id, "runtimeFields", journal);
        if (id === "__end__") {
          node.status = "completed";
          return;
        }
        const data = deepMergeWithArrayOverwrite(
          journal.initialData,
          values(node.fields),
        );
        const nodeInput = Object.keys(node.fields).length
          ? deepMergeWithArrayOverwrite(
              record(journal.initialInput)
                ? journal.initialInput
                : { rawInput: journal.initialInput },
              values(node.fields),
            )
          : journal.initialInput;
        const workflowState = deepMergeWithArrayOverwrite(
          initialWorkflowState(journal),
          values(node.workflowFields),
        );
        const ownInternal = node.runtime.__kortyx;
        const inheritedRuntime = deepMergeWithArrayOverwrite(
          journal.initialRuntime,
          values(node.runtimeFields),
        );
        privateState = {
          ...state,
          input: nodeInput === undefined ? undefined : clone(nodeInput),
          data: clone(data),
          runtime: clone({
            ...inheritedRuntime,
            tokenUsage: zeroUsage(),
            ...node.runtime,
            __kortyx: {
              ...(record(ownInternal) ? ownInternal : {}),
              workflowState:
                record(ownInternal) && record(ownInternal.workflowState)
                  ? ownInternal.workflowState
                  : workflowState,
            },
          }) as GraphState["runtime"],
          conversationHistory: [],
          awaitingHumanInput: false,
        };
        let index = 0;
        node.status = "running";
        const updates = await (executors[id] as NodeExecutor)(
          privateState,
          (request) => {
            const position = index++;
            if (position < node.responses.length)
              return node.responses[position];
            node.request = request;
            throw new GraphInterrupt([]);
          },
          (nodeState) => {
            const snapshot = clone(journal);
            (snapshot.nodes[id] as NodeRecord).runtime = clone(
              nodeState.runtime,
            );
            for (const activation of Object.values(snapshot.nodes))
              if (activation.status === "running")
                activation.status = "pending";
            return {
              ...state,
              lastNode: id,
              input: nodeState.input,
              data: nodeState.data ?? {},
              conversationHistory: [
                ...state.conversationHistory,
                ...ids.flatMap(
                  (nodeId) => snapshot.nodes[nodeId]?.history ?? [],
                ),
              ],
              runtime: { ...nodeState.runtime, ...runtimePatch(snapshot) },
            };
          },
        );
        node.runtime =
          (updates.runtime as Record<string, unknown> | undefined) ??
          (privateState.runtime as Record<string, unknown>);
        const delta = updates.__kortyxNodeData as Record<string, unknown>;
        const updatedData = updates.data as Record<string, unknown> | undefined;
        for (const key of Object.keys(delta))
          Object.defineProperty(node.fields, key, {
            value: { writer: id, value: updatedData?.[key] },
            enumerable: true,
            configurable: true,
            writable: true,
          });
        const internal = node.runtime.__kortyx;
        for (const [key, value] of Object.entries(node.runtime)) {
          if ([KEY, "__kortyx", "tokenUsage"].includes(key)) continue;
          if (JSON.stringify(value) !== JSON.stringify(inheritedRuntime[key]))
            Object.defineProperty(node.runtimeFields, key, {
              value: { writer: id, value },
              enumerable: true,
              configurable: true,
              writable: true,
            });
        }
        const updatedWorkflow =
          record(internal) && record(internal.workflowState)
            ? internal.workflowState
            : {};
        for (const [key, value] of Object.entries(updatedWorkflow)) {
          if (JSON.stringify(value) !== JSON.stringify(workflowState[key]))
            Object.defineProperty(node.workflowFields, key, {
              value: { writer: id, value },
              enumerable: true,
              configurable: true,
              writable: true,
            });
        }
        node.history =
          (updates.conversationHistory as
            | GraphState["conversationHistory"]
            | undefined) ?? [];
        node.selected = (outgoing.get(id) ?? [])
          .filter(
            (edge) =>
              !edge.when ||
              edge.when === (updates.lastCondition ?? updates.lastIntent),
          )
          .map((edge) => edge.to);
        node.status = "completed";
        delete node.request;
      } catch (error) {
        const patch = (
          error as { __kortyxHookStatePatch?: Record<string, unknown> } | null
        )?.__kortyxHookStatePatch;
        if (privateState) node.runtime = { ...privateState.runtime, ...patch };
        if (isGraphInterrupt(error)) node.status = "waiting";
        else if (isExecutionLimitReached(error)) {
          node.status = "limited";
          control ??= error;
        } else if (
          isExecutionCancelled(error) ||
          execution.abortSignal?.aborted
        ) {
          control ??= error;
        } else if (serializeFailure(error).category === "persistence")
          control ??= error;
        else {
          node.failure = serializeFailure(error);
          node.failure.context = {
            ...node.failure.context,
            node: id,
            workflow: workflow.id,
          };
          node.status = "failed";
          node.selected = (outgoing.get(id) ?? []).map((edge) => edge.to);
        }
      }
    };
    const launch = () => {
      if (control || execution.abortSignal?.aborted) return;
      for (const id of ids) {
        if (id === "__end__") continue;
        const node = journal.nodes[id] as NodeRecord;
        if (node.status !== "pending" || running.has(id)) continue;
        const sources = incoming.get(id) ?? [];
        if (
          !sources.every(
            (from) =>
              from === "__start__" ||
              terminal(journal.nodes[from] as NodeRecord),
          )
        )
          continue;
        const activeSources = sources.filter((from) =>
          from === "__start__"
            ? (outgoing.get(from) ?? []).some(
                (edge) =>
                  edge.to === id &&
                  (!edge.when ||
                    edge.when === (state.lastCondition ?? state.lastIntent)),
              )
            : journal.nodes[from]?.selected.includes(id),
        );
        if (!activeSources.length) {
          node.status = "skipped";
          continue;
        }
        const task = start(
          id,
          activeSources
            .filter((from) => from !== "__start__")
            .map((from) => journal.nodes[from] as NodeRecord),
        );
        running.set(
          id,
          task.finally(() => running.delete(id)),
        );
      }
    };
    try {
      while (true) {
        launch();
        if (!running.size) break;
        await Promise.race(running.values());
      }
      throwIfExecutionAborted(execution.abortSignal);
      if (control) throw control;
    } catch (error) {
      // Drain admitted work before persisting a pause or reporting cancellation.
      await Promise.allSettled(running.values());
      if (error && typeof error === "object")
        Object.assign(error, { __kortyxHookStatePatch: runtimePatch(journal) });
      throw error;
    }
    journal.waitingNode = ids.find(
      (id) => journal.nodes[id]?.status === "waiting",
    );
    if (!journal.waitingNode) {
      const leaves = ids.filter(
        (id) =>
          id !== "__end__" &&
          journal.nodes[id]?.status !== "skipped" &&
          !journal.nodes[id]?.selected.some((to) => to !== "__end__"),
      );
      await start(
        "__end__",
        leaves.map((id) => journal.nodes[id] as NodeRecord),
      );
    }
    const end = journal.nodes.__end__ as NodeRecord;
    return {
      runtime: {
        ...(end.status === "completed" ? values(end.runtimeFields) : {}),
        ...runtimePatch(journal),
      },
      ...(end.status === "completed"
        ? {
            input: Object.keys(end.fields).length
              ? deepMergeWithArrayOverwrite(
                  record(journal.initialInput)
                    ? journal.initialInput
                    : { rawInput: journal.initialInput },
                  values(end.fields),
                )
              : journal.initialInput,
            data: deepMergeWithArrayOverwrite(
              journal.initialData,
              values(end.fields),
            ),
            conversationHistory: ids.flatMap(
              (id) => journal.nodes[id]?.history ?? [],
            ),
          }
        : {}),
    };
  });

  builder.addNode(WAIT, (state) => {
    const journal = load(state);
    const id = journal.waitingNode;
    const node = id ? journal.nodes[id] : undefined;
    if (!id || !node?.request)
      throw new WorkflowContractError("Missing waiting parallel node.");
    // One engine interrupt per suspension revision. Its answer belongs only to this activation.
    const request: InterruptInput = {
      ...node.request,
      meta: {
        ...node.request.meta,
        __kortyxResumeStatePatch: runtimePatch(journal),
      },
    };
    let response: unknown;
    try {
      response = interrupt(request);
    } catch (error) {
      config.emit?.("interrupt", {
        node: id,
        workflow: workflow.id,
        input: request,
      });
      throw error;
    }
    node.responses.push(response);
    node.status = "pending";
    delete journal.waitingNode;
    return { runtime: runtimePatch(journal) };
  });
  builder.addNode(FINISH, (state) => {
    const journal = load(state);
    const failed = ids.filter((id) => journal.nodes[id]?.status === "failed");
    if (failed.length) {
      const relevant =
        [...failed].reverse().find((id) => id !== "__end__") ??
        (failed[0] as string);
      const detail = journal.nodes[relevant]?.failure as FailureDescriptor;
      const error = errorFromFailure({
        ...detail,
        results: failed.map((id) => ({
          status: "rejected",
          failure: journal.nodes[id]?.failure,
        })),
      });
      Object.assign(error, { __kortyxHookStatePatch: runtimePatch(journal) });
      throw error;
    }
    return {
      runtime: {
        [KEY]: null,
        __kortyx: {
          workflowState: deepMergeWithArrayOverwrite(
            initialWorkflowState(journal),
            values(journal.nodes.__end__?.workflowFields ?? {}),
          ),
        },
      },
    };
  });
  builder.addEdge("__start__", WORK);
  builder.addConditionalEdges(
    WORK,
    (state) => (load(state).waitingNode ? "wait" : "finish"),
    { wait: WAIT, finish: FINISH },
  );
  builder.addEdge(WAIT, WORK);
  builder.addEdge(FINISH, "__end__");
}
