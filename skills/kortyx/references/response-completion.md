# Complete responses and discover background interrupts

Use `completeResponse` for chat that can finish before internal execution. Confirm
exports in the installed release. Public guide: `/docs/guides/background-continuation`.

## Node semantics

- `await completeResponse()` emits no new content; `{ message, data }` emits a final
  message and generic structured-data chunk before one done and transport close.
  Data must be JSON-compatible and does not merge into internal workflow data.
- Execution continues through code, node returns, edges and transitionTo. Returned
  UI and other client emissions after completion are suppressed. Repeated completion
  is harmless; background failures still affect execution and telemetry.
- Prefer a separate completion node after the last response-producing node. The
  foreground snapshot includes existing state/hook updates, not future returns.
- Call only in root-workflow nodes, including root handoffs. Child useWorkflow calls
  cannot complete the parent's response. Join all branches whose output is required
  before completion; it does not join siblings or enable parallel child calls.
- New agent.execute invocations ignore the response hook and keep final output
  validation. Direct resume awaits its attempt and never reconnects old chat. Buffered
  chat closes at the same boundary as SSE.

## Lifetime and persistence

- Pass request.signal as abortSignal. Client cancellation stops execution before
  completion; after completion it detaches. Use a separate streamChat executionSignal
  for server cancellation. Models/tools retain the same live signal. Limits remain.
- streamChat and createChatRouteHandler accept onExecution(completion: Promise<void>).
  Connect it to host lifetime, e.g. Next after(async () => { await completion; ... }).
  It settles at completion/failure/cancellation/suspension; resolution is not success.
  Flush telemetry there. No automatic worker recovery or durable scheduling exists.
- Finalize the chat checkpoint before closure; background work must not change the
  session head or next turn's workflow/data. Internal execution persistence remains
  necessary for suspension. Closed-response state survives background resume.
- Application rollback/fork does not undo or automatically restart background side
  effects. Keep business writes idempotent. Do not present chat snapshots as durable
  mid-node execution commits.

## Interrupts: no node API redesign and no required Studio

Use ordinary useInterrupt. Background human/limit pauses persist and remain pending
until answered/expired. Do not add callbacks, prepareInterrupt, or DB writes inside
nodes just to discover pauses. Build the approval interface at the app boundary.

```ts
const scope = { context: { tenantId: authorizedTenantId } };
const pending = await agent.listInterrupts({ ...scope, afterResponseCompleted: true });
const interrupt = await agent.getInterrupt(interruptId, scope);
if (!interrupt) throw new Error("Unavailable or expired");
const result = await agent.resume({
  workflow: interrupt.workflow,
  resume: interrupt.resume,
  response: { type: "select", ids: [selectedOptionId] },
});
```

Require nonempty server-authorized sessionId/runId/context scope. Filters combine
with AND and context values compare exactly. List exposes ready, unexpired requests,
public ids, question/options and timestamps; get includes a PRIVATE resume handle.
Never serialize the get result wholesale or expose its token in telemetry. IDs are
not authorization. Validate identity/access in app endpoints and handle concurrent,
consumed or expired requests; handle every resume outcome, including another pause.

Memory and Redis support optional pendingRequests.list. Custom stores without it
fail discovery explicitly. Discovery enumerates pending records; namespace stores
per application and use bounded polling. Configure TTL for approval latency (default
15 minutes). A backend can query independently of Studio. Studio is a read-only
second discovery surface: its interrupt IDs match runtime request IDs, and its
post-response notice is informational, not proof an approval interface is missing.

## Boundaries and verification

Keep conversation archives, long-term memory, business decisions, approval UI,
notifications and worker scheduling app-owned. Do not add PostgreSQL or make Studio
an execution dependency for this feature.

Exercise `/background` in the API-route example: response closes, refresh discovers
an internal review, Save/Skip resumes, chat stays closed. No model key required. The
example cookie is demo session isolation, not production authentication. Configure
telemetry optionally, publish the real workflow catalog and inspect the run's
separate response status and flagged interrupt in Studio. Test actual SSE closure,
request/server cancellation races, second chat turns, repeated/replayed completion,
background human and limit resume with reconstructed Redis, scoped discovery and
stale answers. Do not infer lifetime correctness from observing a done chunk alone.
