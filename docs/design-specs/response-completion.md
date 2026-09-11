# Complete a response while execution continues

## Contract

`await completeResponse()` closes only client output. Optional `{ message, data }`
emits a final message and generic structured-data payload before one `done`.
The call does not return from the node, join parallel branches, or finish the run.
Subsequent node return values, edges, handoffs, usage and telemetry remain active.
Call from a root node after joining every branch needed by the response; child
workflows cannot close their caller's response. Repeated completion is harmless.

Response output and node data are separate. Empty completion emits no content.
The snapshot at the call includes existing node input/state, not future returns.
Use a separate completion node to include the preceding node's committed output.
Persist the foreground chat checkpoint before closing; later work never advances
the chat head. Runtime snapshots still support human and limit suspensions.
Persist closed-response state across resume, but never inherit it into a new turn.

Client disconnect cancels until completion commits; afterwards only execution
cancellation applies. Expose the execution attempt's completion promise for host
lifetime integration. No worker, durable scheduler, message archive or new database
is introduced. Direct execute/resume still await the authoritative outcome;
completeResponse has no effect on a fresh direct invocation. Buffered chat finishes
at the same boundary as SSE. Output completion is not delivery acknowledgement.

## Interrupt discovery

Keep useInterrupt unchanged. Background human/limit requests persist and suspend.
Add scoped server-only agent.listInterrupts and agent.getInterrupt; the latter
includes a private ResumeHandle for the existing agent.resume command. Public ids
match Studio interrupt ids. Scope by session/run and/or exact context fields;
authorize scope and answers in the application. Return only ready, unexpired
requests and strip internal resume metadata. Optional store capabilities preserve
custom adapter compatibility; unsupported discovery reports an explicit error.
Memory and Redis implement discovery. Studio stays optional and read-only,
showing response completion separately from run completion and flagging interrupts
created after response completion. Telemetry never includes private resume tokens.

## Validation and documentation

Exercise response ordering, empty/payload completion, repeated calls, continued
nodes/handoffs, failures/retries, disconnection races, server cancellation, child
restrictions, direct/buffered execution, human/limit suspension and reconstructed
Redis resume, scoped discovery, duplicate/stale responses and unchanged chat head
while a second turn runs. Keep existing suites passing with 100% package coverage
where required; report measured coverage and any gaps. Add a real example flow
and approval interface, verify it and the resulting Studio lifecycle in a browser.
Teach the same boundaries and executable APIs in the Kortyx skill and website.

## Verification — 2026-09-10

| Suite | Result | Measured coverage (statements / branches / functions / lines) |
| --- | --- | --- |
| Agent, with real Redis | 192 passed | 100 / 100 / 100 / 100 |
| Runtime, configured suite | 31 passed | 100 / 100 / 100 / 100 |
| Hooks, full tests with completion-hook coverage | 129 passed | complete-response.ts: 100 / 100 / 100 / 100 |
| New background HTTP routes | 9 passed | 100 / 100 / 100 / 100 |
| Studio | 56 passed | Browser verification also completed |
| Telemetry database | 31 unit tests and 9 PostgreSQL integration tests passed | Projection flag tested for true, false and absent values |

These numbers are scoped measurements, not a claim of repository-wide 100%.
The runtime's existing coverage configuration excludes graph/Redis internals;
the changed paths also have real Redis execution/resume and Redis failure tests.
The full hooks package retains pre-existing coverage gaps outside the new hook.
No coverage exclusions or ignore pragmas were added to reach these results.
The existing example's five deterministic tests pass; its model-dependent test
remains skipped. SDK build, affected package typechecks, website typecheck, skill
validation and diff whitespace checks pass.

Browser checks used the real Next.js example on port 4100, Redis, telemetry API
on 6400 and Studio on 6300:

- Background Save: run-f8908dbe-96a1-4a0e-9039-5db865259644.
- Background Skip: run-e87bfdd4-19ee-4cd2-a55f-d1abd035b0d3.
- Observed response closure before discovery, a pending Studio interrupt flagged
  as after response completion, application-owned resolution, recorded Save/Skip
  responses, and completed runs with separate Response: Completed status.
- Existing direct execution with child approval still suspends and resumes to a
  validated completed result (run-d7365d87-b260-45c8-9aaa-c4efbbae8915).
- Existing streaming limits example pauses at Continue and finishes both children
  after approval.
- Website guide renders at /docs/guides/background-continuation, including sidebar,
  heading links, code blocks and the checkpoint/entry-point behavior table.

Core regressions cover duplicate and retried completion, later hidden emissions,
handoffs, request/server cancellation including resume, repeated background human
interrupts, limit continuation, stale/scoped discovery, foreground head isolation
while a later chat turn runs, direct execution, buffered HTTP and SSE closure.
