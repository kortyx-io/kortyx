# Observe detail views: Sessions, Runs, and Interrupts

Status: Draft v0.1

Scope: Kortyx Studio detail routes and the telemetry/API surface required to support them

Routes: `/sessions/[sessionId]`, `/runs/[runId]`, `/interrupts/[interruptId]`

## 1. Product thesis

These pages are one connected debugging surface at three levels of resolution:

- **Session:** What happened across a continuing interaction, and where did it go wrong?
- **Run:** What exactly executed, in what order, with what data, latency, cost, and failure?
- **Interrupt:** Why is execution waiting, what decision is required, and what happened when it resumed?

The same detail content must render in two shells:

1. **Intercepted drawer** when opened from a list. This preserves filters, scroll position, column layout, and investigative context.
2. **Canonical full page** on direct navigation, refresh, or open-in-new-tab.

Expansion is a third presentation state of the intercepted route: the drawer morphs to occupy the application content column without changing the already-canonical URL. It should look and behave like the full-page surface, while remaining reversible in place.

The UI must never synthesize events or label evenly distributed timestamps as a timeline. Unknown and uncaptured data is shown honestly as `Not captured`, with a short instrumentation hint where useful.

## 2. Research synthesis

Patterns worth adopting:

- LangSmith keeps the surrounding thread visible while drilling into a run, and separates a conversation-oriented view from a debugging-oriented details view. It exposes inputs, outputs, timing, tokens, errors, metadata, and child runs in the latter. [View traces](https://docs.langchain.com/langsmith/view-traces)
- Langfuse separates session, trace, and observation scopes. Its trace detail supports equivalent tree and chronological views, observation search, and configurable metric visibility. [Data model](https://langfuse.com/docs/observability/data-model), [new trace view](https://langfuse.com/changelog/2025-03-19-new-trace-view)
- Kestra makes an execution explorable through overview, Gantt, logs, topology, outputs, metrics, and dependencies, and keeps task-level actions close to task-level evidence. [Execution detail](https://kestra.io/docs/ui/executions)
- Temporal treats event history as the audit source, but also demonstrates that raw history is not enough: pending/retrying work, the latest failure, and dense time clusters need explicit affordances. [Pending activity explanation](https://community.temporal.io/t/when-does-temporal-write-the-activitytaskstarted-event-into-workflow-history/6162), [timeline zoom request](https://community.temporal.io/t/feature-request-interactive-zoom-for-the-event-history-timeline/18315)

Recurring pain points that should shape the design:

- **Missing or partial instrumentation is hard to diagnose.** Users see one undifferentiated span, missing tokens/cost, or absent input/output without knowing whether the problem is the UI or ingestion. [Langfuse issue #7847](https://github.com/langfuse/langfuse/issues/7847)
- **Stale or hidden retry state misleads debugging.** A detail page must distinguish current state from historical failures and show attempts explicitly. [Temporal forum](https://community.temporal.io/t/workflowtaskfailed-doesnt-update-remains-frozen-wrt-failure-reason-making-it-a-bit-hard-to-debug/13092)
- **Long histories become visually compressed.** Search, collapse, duration bars, critical-path emphasis, and later zoom/pan are more useful than an unbounded event list.
- **Deep links must retain exact selection.** A link to a source observation that lands only at the parent trace loses the user's context. [Langfuse issue listing](https://github.com/langfuse/langfuse/issues)
- **Derived projections can drift from the event source.** Detail APIs should project from stored telemetry deterministically and offer raw events for verification, rather than create an independent mutable detail model.

The referenced Workfully implementation was inspected after repository authorization was restored. Its most useful choices are:

- a segment-local `@drawer` parallel slot and `(.)[entityId]` intercepting route;
- the same canonical URL for the intercepted and direct states—the navigation type selects the presentation;
- local expansion that animates the panel's left edge to the sidebar boundary, rather than navigating;
- a `default.tsx` returning `null`, plus a slot-local `loading.tsx` returning `null` so Suspense does not flash the list's full-page skeleton;
- unresolved data promises passed into a client drawer, allowing the chrome and matching skeleton to render immediately while sections stream independently;
- content that responds to its own container width, so one component can stack in the narrow drawer and split into two panes when expanded;
- delayed `router.back()` after the close animation, and a pathname guard because parallel slots can retain their last mounted subpage across soft navigations.

## 3. Information architecture shared by all detail views

### 3.1 Shell anatomy

**Drawer mode**

- Right-side drawer. Start at 32rem for the denser Kortyx explorer; validate 28–36rem in prototype testing. Unlike a user profile form, a Run tree needs enough room to remain scannable.
- On narrower viewports, it becomes a full-viewport sheet; this is still the intercepted navigation state.
- Sticky header: entity icon/type, human-readable identity, status, copy ID, expand, close.
- Sticky local tab bar under the header.
- Drawer content owns its vertical scroll. The list behind it is inert but visually retained.
- `Escape` or Close calls `router.back()`; browser Back has the same result.
- Expand is local UI state: animate the panel's left edge from its fixed drawer width to the current sidebar boundary. The right edge remains pinned, producing a single morphing surface rather than a drawer unmount followed by a page mount.
- In expanded state, remove the modal backdrop and modal semantics, and let the panel behave as the application's content surface. Collapse/back behavior must remain explicit; expansion itself does not change history.
- Close starts the exit animation and calls `router.back()` on animation completion.

**Full-page mode**

- Uses the same domain content components and tab model inside the standard Studio shell. The route-level composition may differ so the full page can fetch in parallel and handle `forbidden`, `notFound`, or errors server-side.
- Adds breadcrumb/back-to-list, more horizontal room, and an optional persistent inspector column.
- Direct URL load, refresh, and copied URLs always render this mode.

### 3.2 Route topology

Recommended App Router structure:

```text
app/
  sessions/
    layout.tsx                       # accepts children + drawer parallel slot
    @drawer/
      default.tsx                    # null
      loading.tsx                    # null; contains slot suspense
      (.)[sessionId]/page.tsx
    [sessionId]/page.tsx             # canonical full page
    page.tsx                          # list
  runs/                               # same shape
  interrupts/                         # same shape
```

Keep each parallel slot at the list segment that it overlays. This avoids mounting one global detail slot in the root layout and makes retained-slot visibility easier to reason about.

The drawer route starts detail requests without awaiting them and passes the promises into a client `DetailDrawer`. The drawer chrome mounts immediately; nested Suspense boundaries stream the summary, explorer, and linked-entity sections into shape-matched skeletons. The canonical full-page route may await requests with `Promise.all` before composing the page.

Route pages fetch data and select a shell only. They render shared domain components such as `SessionSummary`, `RunExecutionExplorer`, and `InterruptDecision`. Drawer routes must not fork the business presentation or event interpretation logic.

List-row navigation pushes the canonical entity URL. The soft navigation is intercepted and fills `@drawer`; direct/hard navigation to the same URL renders `[entityId]/page.tsx`. Links inside detail content remain canonical and shareable.

Because Next.js parallel slots can retain their previous subpage after unrelated soft navigation, the reusable drawer accepts an exact `matchPath` and renders nothing unless `usePathname()` still matches. Reset expanded/closing state whenever visibility or the matched path changes.

### 3.3 Shared controls and URL state

- Copy entity ID and canonical URL.
- Expand/collapse the intercepted surface; offer `Open in new tab` separately when useful.
- Previous/next entity in the current list result set where list context exists.
- Live status refresh for `running` and `pending` entities; show `Updated … ago` and pause refresh while a user is selecting text.
- Tab, selected event/span/run, display mode, and search are encoded in query state: e.g. `?tab=timeline&event=evt_123&view=tree&q=retry`.
- Empty, uncaptured, redacted, loading, not-found, and API-error states are first-class designs.
- Keyboard: `Esc` close, `E` expand, `C` copy ID, `/` focus event search, `J/K` next/previous item when focus is not in an input.

## 4. Session detail

### 4.1 Primary jobs

1. Replay the sequence of runs in a session without opening each run.
2. See state-changing moments: checkpoints, forks, rollbacks, interrupts, failures, and resumes.
3. Identify which turn/run caused cost, latency, or failure to spike.
4. Move to the exact Run or Interrupt while retaining session context.

### 4.2 Header

- `Session` eyebrow and short ID; full ID on copy/hover.
- Status, environment, last activity, active workflow/version.
- Compact metrics: runs, active duration, tokens, cost.
- Chips/links: user, tenant, providers/models, tags.
- If interrupted: prominent `Waiting for input` callout linking to the pending interrupt.

### 4.3 Tabs

**Activity** — default

- Vertical sequence grouped by run, newest-last for replay semantics.
- A run card shows start time, status, workflow/version, duration, token/cost summary, node path, latest result/error, and links to Run detail.
- Session events appear between run cards as distinct audit markers: checkpoint created, forked from/to, rolled back to checkpoint, interrupt created/resolved.
- `Show technical events` reveals raw event rows inline.
- Once message input/output is captured reliably, run cards may render a conversation treatment. Before then, call this tab **Activity**, not **Messages**.

**Runs**

- Dense embedded table scoped to the session with status/workflow/date search and failure-only toggle.
- Selecting a row opens Run detail without losing the session filter.

**State**

- Checkpoint list with timestamp, workflow/node position, checkpoint ID, parent/fork relationship, and captured state preview.
- Fork/rollback ancestry shown as a small branch graph only when there is branching; otherwise a chronological list is clearer.
- JSON state diff between two selected checkpoints is a post-MVP enhancement and requires state snapshots.

**Metadata**

- IDs, user/tenant, environment, workflows/revisions, models/providers, tags, pricing status/source, first/last activity.
- Raw metadata JSON with copy and collapse.

### 4.4 Drawer adaptation

- Activity stays single-column.
- Metrics collapse into a horizontally scrollable strip.
- Run cards show result/error snippets collapsed to three lines.
- State branch graph falls back to the chronological checkpoint list under 900px.

## 5. Run detail

### 5.1 Primary jobs

1. Find the failing, slow, expensive, or unexpected step quickly.
2. Understand hierarchy and chronology without switching mental models.
3. Inspect the real input, output, error, model usage, tool payload, and metadata for one step.
4. Follow related Session, Interrupt, Workflow revision, or transition.

### 5.2 Header

- `Run` eyebrow, short/full ID, status with live indicator, environment.
- Workflow path and revisions; session link; started/ended timestamps.
- Metrics: duration, tokens, cost, models; badges for tools, retries, and interrupt.
- Failure summary or waiting-for-input callout appears directly under the header, not buried in a tab.

### 5.3 Default workspace: execution explorer

This is a split workspace rather than a decorative timeline:

- **Left/main:** searchable execution tree or chronological timeline.
- **Right inspector:** selected event/span detail. It becomes an in-flow panel in narrow drawer mode.
- Tree rows show type icon, node/span name, status, start offset, duration bar, tokens, and cost when applicable.
- Hierarchy derives from `spanId`/`parentSpanId`; chronology derives from `occurredAt`.
- Toggle: `Tree | Timeline`. Both use the same events and preserve selection.
- Filters: errors, model calls, tools, interrupts, retries; search by name, node, event type, or ID.
- Auto-expand the failure ancestry and current/pending path. Successful subtrees are collapsed by default on large traces.
- Selecting an event updates `event=` in the URL and scrolls/highlights it in either view.

### 5.4 Inspector sections

- **Overview:** type, status, timestamp, duration, node/workflow, span/parent IDs, attempt/retry information.
- **Input / Output:** syntax-aware JSON/text rendering, collapse large values, copy field/path. Clearly label uncaptured or redacted content.
- **Error:** message, stack, structured cause, retry outcome, and the latest/current distinction.
- **Usage:** model/provider, token breakdown, latency/TTFT when captured, pricing line items/source.
- **Metadata:** context metadata, tags, service/deployment reference, raw payload.
- **Links:** parent/children, session, interrupt, workflow revision, and transitioned workflow.

### 5.5 Secondary tabs

- **Execution** (default): tree/timeline plus inspector.
- **Topology:** revision graph colored by this run's path and state; clicking a node filters/highlights its events. This is valuable because Kortyx already records workflow topology.
- **Events:** canonical raw event table, sortable by sequence/time, export JSON. This is the audit/debug escape hatch.
- **Summary:** compact input/result/error, metrics, IDs, and metadata. Useful in the drawer and for non-technical users.

Do not ship separate `Logs` or `Gantt` tabs until Kortyx captures logs or stable span intervals. The execution timeline already provides a Gantt-like duration view from span events.

## 6. Interrupt detail

### 6.1 Primary jobs

1. Understand the exact decision requested and its consequences.
2. For pending interrupts, respond safely with sufficient execution context.
3. For resolved interrupts, audit who answered, what they answered, and whether resume succeeded.
4. Diagnose expiration, cancellation, or resume failure.

### 6.2 Header and decision card

- `Interrupt` eyebrow, ID, status, type, age/deadline, environment.
- Workflow/node, run, and session are linked.
- The first content block is the **decision card**: question, options/schema, captured context, and expiry.
- Pending urgency is semantic: deadline and age, not an invented priority score.

### 6.3 Tabs

**Decision** — default

- Question and request data rendered by type: choice, multi-choice, text, or schema-driven form.
- Context panel: initiating node, preceding run events, relevant input/output excerpt, user/tenant.
- Response section:
  - pending: response controls only if the Studio has a supported authenticated resume command;
  - resolved: submitted response, resolved by, resolved at;
  - failed/expired/cancelled: outcome explanation and error.
- Destructive or side-effecting resume actions require explicit confirmation and idempotency protection.

**Timeline**

- Created → viewed/claimed (future) → response submitted → resume attempted → resumed/failed/expired/cancelled.
- Link the creation and resume events to their exact locations in Run detail.
- Never collapse `resolved` and `resumed`: the human decision and the runtime outcome are separate facts.

**Payload**

- Request schema/data, response schema/data, metadata, resume error, token presence (masked), and raw telemetry events.
- Resume tokens are secrets/capabilities: never display or copy the raw value in Studio.

### 6.4 Command boundary

MVP is read-only. Adding `Respond`, `Cancel`, or `Retry resume` is worthwhile only with:

- a server-side command endpoint (never a browser-exposed resume token),
- project-scoped authorization and audit actor,
- idempotency keys and terminal-state conflict handling,
- schema validation shared with the SDK,
- optimistic UI followed by authoritative event reconciliation.

This is a valuable extension because interrupt handling is a core Kortyx differentiator, but it should be a separate command-surface RFC rather than hidden inside this display work.

## 7. Current support vs required extensions

| Capability | Existing telemetry/SDK support | Detail-view decision |
|---|---|---|
| Run/session/workflow/node correlation | Yes: run, session, workflow/revision, node, trace/span/parent IDs | Ship now |
| Run status and timing | Yes: span lifecycle, cancellation, timestamps | Ship now; calculate from real events |
| Hierarchical execution tree | Yes: span and parent span IDs | Ship now after detail projection API |
| Generations, tool calls, workflow transitions | Yes: typed event families and arbitrary payloads | Ship now; define stable detail projections |
| Token and pricing summary | Yes, including pricing status/source and usage primitives | Ship now; preserve `unknown` vs `unpriced` |
| Interrupt lifecycle and response outcome | Yes | Ship read-only now |
| Session run list and aggregate metrics | Yes | Ship now via detail API |
| Checkpoint/fork/rollback occurrence | Yes | Ship event history now |
| Checkpoint state snapshot and diff | Not guaranteed in Studio projection | Extend only if payload size/redaction/storage rules are designed |
| Human-readable session transcript | Not guaranteed; current run result is often only an aggregate label | Do not call the view Messages yet; extend telemetry with normalized run input/output or message events |
| Detailed span/tool/generation input and output | Payload is flexible, but stable presence/shape is not contracted | Define a versioned projection and explicit capture/redaction semantics |
| Retry attempts/backoff | Retry is currently inferred by payload text in the read model | Worth extending with explicit attempt, max attempts, and next retry timestamp |
| Logs | No dedicated event contract | Defer; add only with severity, source, timestamp, trace/span correlation, retention, and redaction contract |
| TTFT and latency breakdown | Not guaranteed | Optional generation event extension |
| Interactive interrupt commands | Runtime can resume, but Studio has no secure command API | Separate high-value extension |
| Annotation/feedback/compare/replay | Not present | Post-MVP; require explicit product/API design |

### Recommended telemetry contract extensions

Priority order:

1. **Detail read APIs without SDK changes.** Expose already stored events, topology, and relationships safely.
2. **Stable capture envelope.** Standardize optional `input`, `output`, `error`, `attributes`, and `contentCapture: captured | redacted | omitted` shapes for span/generation/tool events.
3. **Explicit retry fields.** `attempt`, `maxAttempts`, `retryReason`, `nextAttemptAt`, and a stable logical operation ID.
4. **Normalized interaction events.** Only if Kortyx wants a first-class conversation replay, add request/message/result semantics that work beyond chat.
5. **Interrupt command API and audit events.** Add actor, command ID, submitted/accepted/rejected states, without exposing resume tokens.

## 8. API/read-model specification

List endpoints should remain optimized for tables. Detail pages should not fetch every list and scan client-side, as the current Run page does.

Add:

```text
GET /v1/studio/sessions/:sessionId
GET /v1/studio/runs/:runId
GET /v1/studio/interrupts/:interruptId
```

Shared response principles:

- The authenticated project scope is enforced server-side.
- `404` does not reveal cross-project existence.
- Responses contain the summary entity, ordered events, linked-entity summaries, and capture/pricing status.
- Raw events use cursor pagination for large histories; the initial response may include a bounded event window plus counts.
- Event ordering has a deterministic tiebreaker (`occurredAt`, then ingest sequence/event ID).
- Live entities support revalidation/conditional requests and return an authoritative `updatedAt`.
- Detail projections are derived from immutable telemetry and revision records; no separate mutable copy.
- Sensitive payload fields pass through a centralized redaction policy before leaving the API.

Suggested shapes:

```ts
type StudioRunDetail = {
  run: StudioRun;
  events: StudioDetailEvent[];
  eventCount: number;
  topology: StudioWorkflowRevisionSummary[];
  links: {
    session?: StudioEntityLink;
    interrupts: StudioEntityLink[];
    transitions: StudioEntityLink[];
  };
  updatedAt: string;
};
```

Session detail additionally returns its ordered run summaries and session lifecycle events. Interrupt detail returns creation and terminal/resume events plus masked capability metadata. Avoid embedding full sibling details; links are lightweight summaries.

## 9. Visual language

- Dense, calm, operational. Status color is an accent, never the only status signal.
- Monospace for IDs, timestamps, duration, cost, tokens, event types, and payloads; prose/result content remains sans-serif.
- One shared semantic status system across lists, drawers, and full pages.
- Duration bars use relative scale within the current run and show exact values on focus/hover.
- Errors use a red left rail/background tint only at the relevant subtree or card, not across the entire page.
- Unknown, omitted, and redacted are visually distinct.
- Empty tabs are not shown unless the capability exists; this avoids a product full of dead `Logs` and `Metrics` promises.

## 10. Responsive and accessibility requirements

- Drawer/full-page parity: every fact and action is reachable in both shells.
- Focus moves to the drawer heading on open and returns to the originating row on close. The reference implementation does not yet show focus containment/return; Kortyx should add and test it rather than copying that omission.
- Drawer has dialog semantics, an accessible label, focus containment, and inert background.
- Status, hierarchy, and duration do not rely on color alone.
- Tree rows use correct tree/treeitem semantics and support arrow-key traversal.
- Payload viewers are keyboard scrollable; copy buttons announce success.
- Respect reduced motion; drawer transform becomes a short fade/position transition.
- At under 720px, inspector content follows the selected execution row and tabs become horizontally scrollable.

## 11. MVP scope

### Phase 1 — truthful linked detail

- Intercepting drawer + canonical page architecture for all three entities.
- Dedicated detail endpoints.
- Session Activity/Runs/Metadata using existing aggregates and real events.
- Run Execution (tree/timeline), Summary, Events, and links.
- Interrupt Decision/Timeline/Payload, read-only.
- Copy/deep-link, empty/uncaptured/redacted states, live refresh.
- Replace the current fabricated Run timeline.

### Phase 2 — richer debugging

- Stable input/output/error capture envelope and renderers.
- Explicit retry/attempt UI.
- Run Topology tab and session checkpoint ancestry.
- Event export and list-context previous/next navigation.
- Large-trace virtualization, critical-path calculation, timeline zoom/pan.

### Phase 3 — operational actions

- Secure interrupt response/cancel/retry commands.
- Checkpoint state diff, fork/rollback actions if safety semantics are complete.
- Run compare/replay, annotations/feedback, and share controls as separate RFCs.

## 12. Acceptance criteria for Phase 1

1. Clicking any Session, Run, or Interrupt list item performs a soft navigation to the canonical URL and opens the matching detail in a drawer without resetting list state.
2. Refreshing or directly opening that URL renders the identical content as a full page.
3. Expand morphs the intercepted panel to the Studio content bounds without navigation, remount, or loss of selection/tab/search state.
4. Browser Back closes the drawer and restores the originating list scroll/focus.
5. Every timeline timestamp and duration is derived from stored telemetry; no placeholder events or inferred uniform timing.
6. A failed Run opens with its failure ancestry visible and the latest error selected.
7. A pending Interrupt clearly links to its Run and Session and never exposes its resume token.
8. Session activity links to exact Runs, checkpoints, and Interrupts where identifiers exist.
9. Unknown, unpriced, uncaptured, redacted, and not-found states are distinct and tested.
10. Drawer and full-page versions pass keyboard-only navigation and focus-return tests.
11. Detail endpoint tests cover project isolation, deterministic ordering, missing entities, large histories, and payload redaction.
12. Drawer chrome renders before its detail requests finish, and streamed content replaces shape-matched skeletons without layout shift or flashing the list loading state.
13. Navigating away while the parallel slot is retained hides stale drawer content via exact pathname matching.

## 13. Open product decisions

- Should Session default to oldest-first replay or newest-first incident response? Recommendation: oldest-first in Activity, newest-first in Runs.
- Is Studio strictly an observability surface in the first release, or may it execute interrupt commands? Recommendation: ship read-only detail first and design commands separately.
- What payload capture is enabled by default, and which fields are redacted at SDK, ingest, storage, and API layers?
- What event-count threshold triggers virtualization and partial loading?
- Should Run topology support multi-workflow transitions in one canvas in MVP, or show each revision separately? Recommendation: separate revisions first, connected by transition markers.
