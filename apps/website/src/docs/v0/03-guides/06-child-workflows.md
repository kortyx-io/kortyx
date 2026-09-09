---
id: v0-child-workflows
title: "Call Child Workflows"
description: "Await a registered workflow inside a node or custom hook, return typed data, and preserve execution through interrupts, replay, and forks."
keywords: [kortyx, useWorkflow, createWorkflowHooks, child-workflows, typescript, interrupts, replay, fork]
sidebar_label: "Child Workflows"
---
# Call Child Workflows

Use `useWorkflow(...)` when a node needs to run another registered workflow, receive its result, and continue. The call belongs in node code or a custom hook. The parent graph does not need a special node type or a declared call edge.

`transitionTo` hands off execution to another root workflow. It does not provide a return value to the calling node. Use `useWorkflow` for a call that returns.

## Define the child's input and result

Callable workflows declare `inputSchema` and `outputSchema`. These describe the workflow's data contract, not which parents may call it. Both parent and child must be registered with the agent.

```ts
import { createAgent, createWorkflowHooks, defineWorkflow } from "kortyx";
import { z } from "zod";

const ResearchInput = z.object({ topic: z.string() });
const ResearchOutput = z.object({
  summary: z.string(),
  sources: z.array(z.string()),
});

export const researchWorkflow = defineWorkflow({
  id: "research-workflow",
  version: "1.0.0",
  inputSchema: ResearchInput,
  outputSchema: ResearchOutput,
  nodes: {
    summarize: {
      run: async ({ input }: { input: z.output<typeof ResearchInput> }) => {
        // Replace this illustrative result with your research service/model call.
        return {
          data: { summary: `Research about ${input.topic}`, sources: [] },
        };
      },
    },
  },
  edges: [
    ["__start__", "summarize"],
    ["summarize", "__end__"],
  ],
});

const { useWorkflow } = createWorkflowHooks({
  "research-workflow": researchWorkflow,
});

export async function useResearch(args: { id: string; topic: string }) {
  const result = await useWorkflow({
    id: args.id,
    workflow: "research-workflow",
    input: { topic: args.topic },
  });
  return result.data;
}

export const reportWorkflow = defineWorkflow({
  id: "report-workflow",
  version: "1.0.0",
  nodes: {
    report: {
      run: async ({ input }: { input: unknown }) => {
        const research = await useResearch({
          id: "research",
          topic: String(input),
        });
        // This code runs after the child has completed.
        return { data: { report: research.summary.toUpperCase() } };
      },
    },
    finish: {
      run: () => ({ data: { reportReady: true } }),
    },
  },
  edges: [
    ["__start__", "report"],
    ["report", "finish"],
    ["finish", "__end__"],
  ],
});

export const agent = createAgent({
  workflows: [reportWorkflow, researchWorkflow],
  defaultWorkflowId: "report-workflow",
});
```

The child's last node returns an ordinary `{ data: ... }` and reaches `__end__`. There is no return node or `returnTo` command. On completion, Kortyx validates the child's accumulated `GraphState.data` using `outputSchema`; that parsed value becomes `result.data`.

An ordinary Zod object exposes its declared fields. Use `.passthrough()` when additional accumulated data should be returned. Parent data is updated only through the caller's own node result; the child does not automatically merge its state into its parent.

## Type safety

The bound hook infers `input` from the selected workflow's input schema and `result.data` from its output schema. Invalid workflow IDs, wrong inputs, and unknown output fields are TypeScript errors. Use the same definition objects for the hook registry and the agent registry.

You can also pass a typed definition directly without binding string IDs:

```ts
import { useWorkflow } from "kortyx";
import { researchWorkflow } from "./research-workflow";

export async function useResearchDirect(topic: string) {
  const result = await useWorkflow({
    id: "research",
    workflow: researchWorkflow,
    input: { topic },
  });
  return result.data.summary; // string
}
```

The unbound hook accepts dynamic string IDs, but their result is `Record<string, unknown>`. Use a bound registry or a typed reference for inferred properties. Do not add a caller-supplied result cast to simulate type safety.

Runtime validation remains necessary: a node implementation or external service can produce invalid data even when the caller is typed. Input transforms run on the initial invocation; resume uses the parsed input saved in the child checkpoint. Output transforms run at completion, and cached replay returns that parsed result.

Keep definitions inferred from `defineWorkflow(...)`. Widening them to `WorkflowDefinition` loses the concrete schema information needed for typed calls. Schemas are TypeScript/JavaScript objects; plain YAML/JSON workflow files cannot embed executable Zod schemas.

## Human interrupts and resume

Inside a child, use the same `useInterrupt(...)` and `useReason({ interrupt: ... })` hooks used in a root workflow. For example, this can be the research workflow's final node:

```ts
import { useInterrupt } from "kortyx";

export async function reviewResearchNode({
  input,
}: {
  input: { summary: string; sources: string[] };
}) {
  const approved = await useInterrupt({
    id: "review-research",
    request: {
      kind: "choice",
      question: "Use this research?",
      options: [
        { id: "yes", label: "Use research" },
        { id: "no", label: "Discard research" },
      ],
    },
  });
  return {
    data: {
      summary: approved === "yes" ? input.summary : "Research declined",
      sources: approved === "yes" ? input.sources : [],
    },
  };
}
```

The parent remains suspended at `await useWorkflow(...)`. The application receives the normal interrupt stream chunk and resumes using its token and request ID. There is no separate child-resume endpoint. Existing React interrupt rendering continues to work.

Child graph checkpoints travel inside the parent's saved hook state. When the parent node replays, the hook resumes the waiting child or returns a previously completed child's cached result. Completed child nodes do not repeat just because the parent resumes. Previous bridged interrupts retain their positions even if later children or the parent also interrupt.

Code surrounding a hook can replay, including code in `catch` and `finally`. Keep call order and input stable. Use idempotency keys for external writes; a flag in runtime state alone does not make a write atomic with a checkpoint. A child failure rejects with `WorkflowCallError`; a parent can handle that error, but catching a suspension cannot turn a waiting call into a successful fallback.

## Fork, rollback, and persistence

Use the existing [session checkpoint APIs](./05-session-checkpoints.md). A fork made while a child is waiting contains the nested waiting chain. Snapshot-backed forks get separate run IDs and resume tokens, so source and fork can answer differently. Rollback restores the selected child checkpoint and pending writes. It does not undo changes already made to your application database.

Use Redis or another durable framework adapter for pauses that must survive server restarts. In-memory state lasts only for the current process. Retention/TTL still applies. Built-in memory and Redis stores atomically consume resume tokens; stale, cancelled, or cross-session requests fail. Client cancellation ends the waiting execution, whereas selecting an application-defined "Cancel" option resumes node logic with that value.

The saved runtime context is retained during resume. New client history or picker context does not silently change the enclosing node's routing. Authorize every request on the server before invoking the agent, including resumed and forked requests.

## Limits and migration

- Calls are sequential: await each call. `Promise.all` child calls and parallel edges in calling/called workflows are rejected.
- Use a unique, stable call `id` within each node activation. Re-entering a node through a graph loop starts a fresh child invocation. The limits are 64 calls per node activation and 16 nested child levels.
- Child input and output must be JSON values. Avoid `undefined`, functions, dates, maps, cycles, and non-finite numbers.
- Each child has isolated input, accumulated data, node state, and workflow state. Server runtime context, provider access, and tracing are inherited.
- Child streams join the root stream with scoped IDs. Completing a child does not end the parent stream.
- `transitionTo` inside a child is rejected. Convert nested handoffs to awaited child calls and return the fields the caller needs.
- Completed child results and failures are cached through parent replay/retry until the parent node commits. Retrying a failed child intentionally requires a distinct stable call ID and a bounded application retry policy.
- Change workflow versions when changing suspended execution contracts. A changed typed version or changed active child version fails replay; the runtime does not load historic code automatically.
- Durability is at checkpoints. This API does not add background scheduling or arbitrary in-flight JavaScript crash recovery. Serialize concurrent rollback/fork/edit operations at the application/session boundary.

The Canvas example uses this API for creation, brief queries, updates, and saves. The update workflow can call save as a nested child. See [interrupts and resume](./02-interrupts-and-resume.md) and [hooks](../02-core-concepts/07-hooks.md) for the surrounding APIs.
