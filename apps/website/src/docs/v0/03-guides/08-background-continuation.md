---
id: v0-background-continuation
title: "Finish a Response, Continue the Workflow"
description: "Close a chat response, continue internal work, and discover human interruptions without requiring Studio."
keywords: [kortyx, completeResponse, background, listInterrupts, resume, human approval]
sidebar_label: "Background Continuation"
---
# Finish a Response, Continue the Workflow

Use `completeResponse()` when the client has everything it needs but your workflow
still has internal work to do—for example, evaluating a conversation after answering
it. This is an advanced response-lifecycle feature. Ordinary workflows can continue
to finish naturally; existing `useInterrupt()` code does not change.

**Completing a response does not complete execution.** The response closes once;
subsequent nodes, handoffs, model calls, execution limits and telemetry continue.
Kortyx runs this work in your application's process. It does not create a worker,
make a job durable, or require Studio.

## Try it in the example

Start `examples/kortyx-nextjs-chat-api-route` and open `/background`. No model key
or Studio installation is needed for this example.

1. Click **Start example**. The answer appears and the connection closes.
2. Internal analysis continues briefly. Click **Refresh pending reviews**.
3. The application's separate review section shows a pending question.
4. Click **Save** or **Skip**. The backend resumes the run and the chat stays closed.

The example uses a server-set, HTTP-only cookie to isolate demo sessions. A real
application must derive its scope from authenticated users and authorization rules.
If telemetry is configured, inspect the same run and interrupt in Studio. Studio
shows **Response: Completed** independently of execution status and flags an
interrupt requested after response completion. Studio has no approval controls.

## Put completion after the last response-producing node

```ts
import { completeResponse } from "kortyx";

async function respondNode() {
  return {
    data: { answer: "All done!" },
    ui: { message: "All done!" },
  };
}

async function finishResponseNode() {
  await completeResponse();
  return { transitionTo: "analytics" };
}
```

Connect `respondNode` to `finishResponseNode` in your graph. The first node's
returned state and output are already committed when completion runs.

You can also supply final content directly:

```ts
await completeResponse({
  message: "All done!",
  data: { summary: result.summary },
});

return {
  data: result,
  transitionTo: "analytics",
};
```

`message` emits a normal message chunk. `data` emits a final generic structured-data
chunk; it must be JSON-compatible. It does not implicitly update workflow data.
The node's `return` still updates internal data and routing, but returned UI content
after completion is not sent to the client. Empty `completeResponse()` emits no
extra content and never automatically exposes accumulated workflow state.

The call resolves when server-side finalization succeeds. It is not an acknowledgement
that the client received the bytes. Repeated calls after successful completion are
harmless. If the node fails later, execution can fail even though the response has
already completed; inspect execution telemetry for that outcome.

## Parallel branches and child workflows

Completion applies to the whole response, not just the calling node. It does not
wait for sibling branches. If both branches contribute to the answer, join them
first and call `completeResponse()` in the following node. A sibling still running
after completion can continue internally, but its later output is not delivered.
This feature does not add support for parallel child calls.

Only root-workflow nodes can close the response. A workflow reached through
`transitionTo` is a root handoff; a workflow invoked with `useWorkflow()` is a child
and cannot close its caller's response. Await response-producing work before
completion; do not leave a structured response partially emitted.

## Keep the execution attempt alive

The application hosting integration owns the remaining process lifetime. The
`onExecution` option receives a promise that settles after the execution attempt
finishes, fails, cancels, or suspends. The promise resolving does not mean the run
succeeded. It lets a host retain the request's background work without keeping the
response stream open.

For a Next.js route:

```ts
import { createChatRouteHandler } from "kortyx";
import { after } from "next/server";
import { agent } from "@/lib/agent";

export const POST = createChatRouteHandler({
  agent,
  onExecution: (completion) => after(async () => {
    await completion;
    // Flush your application's telemetry adapter here if needed.
  }),
});
```

For a custom transport, pass `onExecution` to `agent.streamChat`. Connect it to
your host's lifetime mechanism. Host time limits still apply. A process terminating
during active work is not automatically recovered; durable scheduling is a separate
application responsibility. Suspensions can be resumed from configured durable
execution persistence, such as the existing Redis adapter.

Before completion, the chat request's `abortSignal` and stream cancellation stop
cooperative execution. After completion, client disconnect no longer cancels it.
Pass a separate `executionSignal` to `agent.streamChat` when server-controlled
cancellation must remain effective throughout. Models, tools and `useAbortSignal()`
receive the live execution signal. Completion never removes execution limits.

## Human input after the response closes

Keep the normal hook:

```ts
const decision = await useInterrupt({
  id: "save-use-case",
  request: {
    kind: "choice",
    question: "Save this conversation as a use case?",
    options: [
      { id: "save", label: "Save" },
      { id: "skip", label: "Skip" },
    ],
  },
});
```

Kortyx persists the suspension. The question cannot travel over the closed chat
connection, so your application displays it elsewhere. Nodes do not save resume
IDs, register callbacks, or implement approval delivery.

There are two ways to discover it:

- **Your backend:** call `agent.listInterrupts()` using an authorized scope.
- **Studio:** inspect pending interrupts and use their public interrupt IDs in
  your application's approval tooling. Studio is optional and read-only; telemetry
  is not authoritative execution state and may arrive late.

```ts
// Derive these values on the server after authenticating the caller.
const scope = { context: { tenantId: authorizedTenantId } };
const pending = await agent.listInterrupts({
  ...scope,
  status: "pending",
  afterResponseCompleted: true,
});
```

The returned array contains public IDs, run/session/workflow/node identifiers,
question/options, creation/expiry timestamps, and `afterResponseCompleted`. It
contains no private resume handles, execution snapshots, or internal hook metadata.
Only fully prepared, unexpired suspensions are returned.

Resolve an answer through an application-owned endpoint:

```ts
const interrupt = await agent.getInterrupt(interruptId, scope);
if (!interrupt) {
  // Missing, outside this scope, consumed, not yet ready, or expired.
  return Response.json({ error: "Interrupt unavailable" }, { status: 404 });
}

const result = await agent.resume({
  workflow: interrupt.workflow,
  resume: interrupt.resume,
  response: { type: "select", ids: [selectedOptionId] },
});
```

`getInterrupt` includes a **private resume handle** for server-side use. Never
return that object wholesale to the browser. An ID does not authorize an answer.
Authorize the actor and scope on the backend; `agent.resume` validates the actual
pending request and claims it once. Another actor may resolve it between lookup
and resume, so handle rejected/stale responses.

The scope must contain a nonempty `sessionId`, `runId`, or `context` filter. Supplied
filters are combined with AND; context values use exact equality. These filters
help enforce application scope but do not authenticate callers. Both built-in
memory and Redis adapters implement discovery. Custom adapters can add the optional
`pendingRequests.list` capability; unsupported discovery throws explicitly.
Discovery currently enumerates the configured pending store: use a dedicated
application namespace and avoid polling it on every render.

A resumed background run keeps the response closed. It can suspend again, so handle
all `agent.resume` outcomes and rediscover any later question. Limit exhaustion also
creates a discoverable Continue request; only your authorized application should
approve additional work. Without an approval interface, the run remains suspended
until answered or expired. Configure persistence TTL for your expected review time;
the default execution TTL is 15 minutes.

## Checkpoints and entry points

| Concern | Behavior |
| --- | --- |
| Chat response | Finalized once; no subsequent client chunks |
| Foreground chat checkpoint | Saved before closing; later work never advances the session head |
| Internal execution checkpoints | Retained as needed for suspension and resume |
| Next chat turn | Starts from foreground state, independently of unfinished background work |
| `agent.execute()` | A fresh direct execution ignores response completion and awaits its final outcome |
| `agent.resume()` | Awaits the resumed attempt's outcome; does not reconnect the old chat |
| Buffered chat (`stream: false`) | Returns at the same response boundary as SSE |
| Rollback/fork | Operates on chat checkpoints; does not undo or automatically restart detached side effects |

The foreground snapshot contains state available **at the call**. It cannot include
future return values or pretend the calling node has finished. Put completion in the
next node when the preceding node's return must be in that snapshot. Explicit final
response data is independent of the workflow's final output schema; normal execution
output validation still runs when the workflow actually finishes.

## Boundaries

Kortyx owns execution, suspension, resume, and configurable execution persistence.
Applications own chat archives, business records, approval interfaces, authorization,
and background scheduling. Studio observes. This feature introduces no memory
system, message database, PostgreSQL requirement, or Studio dependency.
