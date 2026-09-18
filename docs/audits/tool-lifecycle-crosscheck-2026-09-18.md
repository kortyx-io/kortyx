# Tool execution and observability crosscheck

**Baseline audit:** this document records the pre-implementation investigation. The accepted implementation is now present, and the characterization probes were converted to supported-behavior tests. See [implementation status](../design-specs/direct-tool-observability.md) and [the public tool guide](../../skills/kortyx/references/hooks-use-tool.md).

Investigated 2026-09-18. Kortyx baseline: `a4575ae132711cdda7f880022b929cd6eb3e148c` **plus the current working tree**, including existing error-contract changes. This is research and characterization, not a production implementation of `useTool`.

## Conclusion

Keep the proposed `useTool` narrow: let application code select a capability directly, then enter the same execution boundary used by native `useReason({ tools })`. That boundary owns execution admission, cancellation propagation, call identity and observation. Applications retain authentication, permission enforcement, business interpretation, retries and idempotency. No model call, MCP connection, tool registry or automatic caching is required.

The comparison uncovered execution correctness and privacy problems beyond the original Studio lifecycle defects. Fixing native execution is independently justified; adding a public hook should reuse that corrected primitive rather than wrap the existing event emitters. Other frameworks offer useful patterns, but none of the inspected paths is evidence of the complete requested denial/resume/fork/Studio contract.

## Method and version boundaries

Inspected official documentation and these pinned repository snapshots. Main-branch source is not a claim about a released npm version or compatibility with an installed version. External framework suites and their hosted dashboards were not executed.

| Library | Inspected commit | Primary source |
| --- | --- | --- |
| Vercel AI SDK | `9528712c364c6cb46caf97b901bb742d0c623cd7` | [execution dispatcher](https://github.com/vercel/ai/blob/9528712c364c6cb46caf97b901bb742d0c623cd7/packages/ai/src/generate-text/execute-tool-call.ts), [callback isolation](https://github.com/vercel/ai/blob/9528712c364c6cb46caf97b901bb742d0c623cd7/packages/ai/src/util/notify.ts), [telemetry contract/documentation](https://github.com/vercel/ai/blob/9528712c364c6cb46caf97b901bb742d0c623cd7/content/docs/03-ai-sdk-core/60-telemetry.mdx) |
| LangChain JS | `206d8b992bcf90ce7d46f2158f1ad85fc1d826c0` | [StructuredTool invocation](https://github.com/langchain-ai/langchainjs/blob/206d8b992bcf90ce7d46f2158f1ad85fc1d826c0/libs/langchain-core/src/tools/index.ts), [callback manager](https://github.com/langchain-ai/langchainjs/blob/206d8b992bcf90ce7d46f2158f1ad85fc1d826c0/libs/langchain-core/src/callbacks/manager.ts) |
| OpenAI Agents JS | `506f736a10014df5c6d7c68a9987594674d4fabb` | [tool execution and approval](https://github.com/openai/openai-agents-js/blob/506f736a10014df5c6d7c68a9987594674d4fabb/packages/agents-core/src/runner/toolExecution.ts), [export processor](https://github.com/openai/openai-agents-js/blob/506f736a10014df5c6d7c68a9987594674d4fabb/packages/agents-core/src/tracing/processor.ts), [tracing guide](https://openai.github.io/openai-agents-js/guides/tracing/) |
| Mastra | `3c9917a2ae4199326028957ec19c6a6db6437849` | [tool builder](https://github.com/mastra-ai/mastra/blob/3c9917a2ae4199326028957ec19c6a6db6437849/packages/core/src/tools/tool-builder/builder.ts), [tool object](https://github.com/mastra-ai/mastra/blob/3c9917a2ae4199326028957ec19c6a6db6437849/packages/core/src/tools/tool.ts), [tracing types](https://github.com/mastra-ai/mastra/blob/3c9917a2ae4199326028957ec19c6a6db6437849/packages/core/src/observability/types/tracing.ts) |

LangGraph replay behavior is checked against its [official JavaScript interrupt guide](https://docs.langchain.com/oss/javascript/langgraph/interrupts), independently of the LangChain source snapshot. OpenTelemetry's former GenAI agent-span documentation now [points to a separate conventions repository](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/); this audit does not treat that old page as a maintained normative specification.

Kortyx probes execute its current source. The disposable runner uses the actual SDK/runtime, authenticated telemetry API routes, PostgreSQL repositories, Studio API, trace builder and selected React server rendering. Providers are local stubs. New low-level cases use hook context to retain checkpoints across an interrupted node; this isolates the native logic without a live model. It does not independently verify browser hydration, production delivery or Workfully permissions.

## Comparison

| Concern | External pattern observed | Kortyx today / implication |
| --- | --- | --- |
| Direct use | LangChain's public tool `.invoke(...)` owns a callback run even without a model. Vercel's low-level `executeTool` normalizes execution outputs; the inspected model dispatcher supplies observation/context around it. Mastra's tool object validates direct execution, while its builder supplies tool tracing. | Generic public spans work for direct calls, but native tool behavior lives inside `useReason`. A supported hook would bridge that gap; raw business functions should remain independent. |
| Identity and timing | Vercel has individual `execute_tool` spans and measured callback duration. OpenAI creates a function span per dispatched call. Mastra's builder creates a typed tool/MCP span with `toolCallId`. LangChain callback runs carry run and parent IDs. | Native events share the reasoning span, lack execution-only duration, and Studio pairs by that span. Distinct call/attempt identity is necessary, including for repeated calls to the same tool. |
| Active context | OpenAI's guides describe async-local nesting. Vercel's OTel helper uses `startActiveSpan`; Mastra executes with a tool context/current span. | Kortyx `startSpan` does not activate its scope. Reasoning and model-generation spans can be siblings under the node; a nested instrumented operation inside a tool has no active tool span. Use an explicit scoped execution primitive. |
| Errors and denial | Vercel distinguishes a result from a thrown tool error. LangChain has tool end/error callbacks. OpenAI records rejection as an errored function span. Mastra has success attributes and span errors. | These are not proof of a four-state business outcome contract. Kortyx should explicitly support safe application classifiers; do not infer permission denial from arbitrary result fields or exception messages. |
| Approval/cancellation | OpenAI separates approval resolution from approved execution and tracks start/end state, including sibling cancellation. Vercel forwards a combined timeout/abort signal and measures execution inside `finally`. | Kortyx emits an execution start before approval and budget admission, then omits terminals for denied approval and cancellation. Approval waiting and actual execution need separate semantics. |
| Observer failures | Vercel's `notify` catches callback exceptions. LangChain catches handler exceptions unless `raiseError` is explicitly selected. OpenAI's batch exporter catches export errors; its lifecycle hooks can still intentionally affect execution. | Network failure isolation works with Kortyx's built-in adapter, but arbitrary trace callbacks are not isolated. Observation should always preserve the original result/error; policy hooks are a different contract. |
| Validation | LangChain validates before its tool callback starts. OpenAI prepares/validates arguments before dynamic approval. Mastra opens its builder span before validation so invalid calls are observable. | Kortyx's dispatcher passes `inputSchema` to the provider but does not locally validate callback inputs. Define who owns validation and whether invalid attempts are visible; provider conformance alone is insufficient evidence of safety. |
| Replay | LangGraph explicitly documents node restart and possible repeated side effects before interruption. | Observability is not exactly-once execution. Preserve native reason checkpoints, emit reuse facts, and leave direct-call caching/idempotency out of the first hook. |
| Privacy | The inspected Vercel telemetry documentation records content by default once an integration is registered. OpenAI offers a sensitive-content flag. Mastra supplies filtering before export. | Kortyx's content default is appropriately conservative, but automatic request-context metadata bypasses that protection. Redaction after database storage is too late for export privacy. |

Additional source boundaries: [Vercel low-level output normalization](https://github.com/vercel/ai/blob/9528712c364c6cb46caf97b901bb742d0c623cd7/packages/provider-utils/src/types/execute-tool.ts), [active OTel span helper](https://github.com/vercel/ai/blob/9528712c364c6cb46caf97b901bb742d0c623cd7/packages/otel/src/record-span.ts), and [Mastra's pre-export sensitive-field processor](https://mastra.ai/reference/observability/tracing/processors/sensitive-data-filter). Do not generalize the behavior of a low-level business callback to its framework dispatcher. Likewise, a field-name filter cannot guarantee removal of secrets embedded in free text.

## New confirmed Kortyx findings

### K1 — Observation can change execution (high priority)

In [the tool loop](../../packages/hooks/src/reason/tools.ts), `useReason.tool-call.complete` runs inside the same `try` as the business callback **after** its successful result has been appended. If `addEvent` throws, the catch creates another tool result for the same call ID, marks it as an error and feeds that fault to the next model pass. The business callback ran once and succeeded; the observer changed what the model sees.

Separate probes confirm that throwing `startSpan` prevents all execution and skips cleanup, while throwing reasoning-span `end` rejects a successful loop after the callback has run. These exercise a supported adapter interface, not a network outage; the existing offline delivery probe still passes. A native fix should isolate acquisition, events, attributes and terminal reporting, including both Studio and OTel adapters. Do not put outcome classification or delivery errors into the business callback's catch path.

### K2 — Result-owned IDs can trigger duplicate execution (high priority)

[`normalizeToolResult`](../../packages/hooks/src/reason/tools.ts) identifies an already-normalized result by the presence of `toolCallId`, `name` and `content`, then trusts those values. Native checkpoint skip logic searches for the **dispatched** call ID. A result with another ID is therefore not recognized as completed.

Reproduction: the model selects `lookup` then an approval-gated second tool. `lookup` returns a result with a foreign ID/name; the second tool suspends. Resume executes `lookup` again, despite its completed result being checkpointed. This requires a malformed adapter result or a business object colliding with the result-shape heuristic; correct adapter IDs avoid it. Nevertheless, runtime correlation should be authoritative. Validate/reject mismatches or construct the envelope from the dispatcher, keeping arbitrary application data in a distinct result field. Validate duplicate provider call IDs as part of the same contract.

### K3 — Cleanup is bypassed on replay and early abort (medium priority)

[`useReason`](../../packages/hooks/src/reason/use-reason.ts) returns a completed checkpoint before entering the tool loop's owned-resource `finally`. Newly supplied tools can therefore remain unclosed. An already-aborted signal also exits before that `finally`. The probes use close spies, not real MCP connections; they prove the ownership path bypass, while the operational impact depends on whether the caller acquired a resource before invoking the hook. `closeAfterUse: false` remains deliberately application-owned.

Move ownership handling around every exit after accepting owned tools, or use lazy resource acquisition that replay never performs. Do not close the same owner multiple times when several tool definitions share it. Closing a newly supplied resource is separate from rerunning the original business operation.

### K4 — Completion and checkpoint are committed before cleanup failure (medium priority)

The loop emits reasoning completion, saves a completed checkpoint and then closes owned tools. If close rejects on an otherwise successful path, `useReason` rejects. A later retry uses that completed result and skips newly supplied cleanup. The probe demonstrates successful observation/cache and failing API result for the same invocation.

A supported contract must decide whether cleanup failure is fatal or a separate diagnostic. Either is possible, but observation and checkpoint semantics must explain that decision consistently. Do not blindly retry the already successful business side effect, and retain the existing behavior that cleanup never replaces a primary execution failure.

### K5 — Explicit native error results look completed (medium priority)

A returned `KortyxToolResult` with `isError: true` emits `tool.completed`, carrying `isError` only in the payload. Studio's [terminal matcher/status builder](../../apps/studio/src/features/runs/lib/run-trace-story.ts) ignores that flag and renders the tool as completed. Unlike an arbitrary business `{ status: "DENIED" }`, this result already declares an error in Kortyx's public tool contract.

The real SDK → telemetry API → database → Studio builder and React rendering probe confirms this while the model recovers and the root workflow completes. Keep root completion intact; classify the individual tool as fault, or denial only when an explicit safe application classifier identifies it.

### K6 — Content capture off does not prevent context credential export (high priority privacy gap)

The runtime's [node span metadata](../../packages/runtime/src/graph/create-execution-graph.ts) spreads the supplied execution context into telemetry metadata. With default content capture, a fixture context containing `apiKey: "CONTEXT_CREDENTIAL_PROBE"` is transmitted in the actual SDK batch and stored in PostgreSQL. Studio subsequently removes it from its API view.

This requires the application to put a credential in execution context; credentials held only in a factory closure do not leak through this path. The probe still demonstrates that the current default is not a credential firewall. A new tool observer must export an allowlisted projection and avoid spreading context. The broader runtime metadata path needs a deliberate privacy fix or a narrowly documented safe-context contract; review all paths before promising no credentials by default. Mastra's pre-export processor highlights the correct placement, but a filter alone is not a substitute for minimizing exported data.

## Contract decision, not automatically a bug

**K7 — Tool schemas are advertised, not locally enforced.** The native probe gives a tool a JSON schema requiring `jobId`, makes the provider select `{}`, and confirms the callback runs with `{}`. There is no validator in the dispatcher. Since `inputSchema` is currently `unknown`, installing an implicit universal parser would be a new compatibility contract, not a small observability patch. Application factories such as Workfully's schema-parsing adapter can already validate.

Decide and document whether Kortyx guarantees local parsing or the callback owns it. If adding supported validation later, share it between model-selected and direct calls, validate before side effects and dynamic permission checks, and record a safe validation failure without raw arguments. A schema is not a permission check. Invalid input should not be mislabeled as business denial.

## Previously established native defects remain

The original probes already establish shared-span terminal contamination, incorrect tool labels and durations, duplicate starts around approval resume, missing approval-denial/cancellation terminals, missing cached-reuse visibility, duplicate native/manual observations, and ingestion loss of envelope-only invocation/branch correlation. The current API rejects the proposed denial/cancellation/reuse event types. See the [original investigation and proposed contract](../design-specs/direct-tool-observability.md).

Several surrounding behaviors are correct and should survive the refactor: plain native functions execute without MCP; abort signals are forwarded; ordinary thrown faults are sanitized and can be recovered by the model; successful workflow completion is independent of handled tool failure; native cached results avoid callback/model/budget work; built-in delivery failure leaves execution intact; ordinary input/result content is omitted by default.

## Recommended scope and order

1. Correct native execution isolation and authoritative result identity, then resolve cleanup ownership/commit ordering. Cover malformed results, throwing adapters, replay and aborted entry before exposing a second execution path.
2. Introduce one scoped execution primitive with a unique span per actual attempt, authoritative run/child/node/branch/call identity, monotonic execution duration, explicit success/denial/fault/cancellation, and separate approval/reuse observations. A suspended control-flow operation is not a fault or cancellation; no terminal execution should be invented while it waits.
3. Add typed telemetry payloads and ingestion normalization, and make Studio pair/render those identities and outcomes. Ship receiving contract support before the SDK emits new enum values. Preserve incomplete facts when delivery is lost.
4. Expose the proposed `useTool` as a small public entry into that primitive, preserving the original result/error and using the same effective signal and tool budget. Native dispatch and a nested shared integration must adopt the same identity so only one owner emits the lifecycle. Truly nested distinct tools remain separate children.
5. Keep validation guarantees and broader metadata privacy remediation explicitly scoped. Direct automatic caching, policy enforcement, registries, retries and new transports are unnecessary for this feature.

The key acceptance case stays the same: a handled application denial inside a successful child/root workflow shows one **Denied** tool with safe code/duration and correct ownership. Resume/fork distinguishes actual reexecution from reused evidence. No secret/content markers reach the outbound batch, and observer failures preserve business behavior. Repeat through native dispatch to prove the integration emits once.

## Reproduction

**23 characterization probes passed:** thirteen database-backed SDK/API/Studio cases and ten native hook/checkpoint or standalone/offline cases. Biome checks, runner shell syntax and `git diff --check` also passed. No production code was changed by this investigation.

Run `bash scripts/probe-direct-tool-observability.sh` from the repository. It creates a disposable loopback-only PostgreSQL container and removes it on exit. With no database URL, `pnpm exec vitest run --config test/observability/vitest.config.ts` runs the low-level/offline cases and skips the database suite.

Evidence: [native crosscheck probes](../../test/observability/native-tool-lifecycle.test.ts), [end-to-end probes](../../test/observability/direct-tool-observability.test.ts), [source-resolution config](../../test/observability/vitest.config.ts). These are characterization assertions of current defects; they must be inverted into desired-behavior regression tests when the production fixes land.
