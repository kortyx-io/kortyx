# Error contracts and propagation across Kortyx

Status: implemented on `codex/error-contract-hardening`, 2026-09-14; verification and release notes are tracked alongside this scope. This document does not mark the blockers fixed or authorize a production caller switch.

## Outcome and responsibility

Ship one coordinated PR that makes Kortyx failures identifiable, actionable and safe to propagate across the product. A developer must be able to distinguish a failed provider request, invalid model output, application/domain failure and runtime failure without parsing message prose, including after a child checkpoint is restored.

Kortyx owns error facts, public contracts, propagation, safe serialization, accounting and control-flow integrity. Applications own retry budgets, correction prompts, business fallbacks, idempotency and authorization to continue an exhausted execution. A transient classification is eligibility for an application decision, not permission to repeat side effects.

The scope includes the product boundaries below. It does not require replacing every internal `throw new Error` or changing every message in the repository. Internal errors may use a safe unknown-failure fallback when they cross a public boundary; known actionable failures need specific codes at their source.

## Findings from the checkout

The checkout declares `kortyx@0.19.0`, `@kortyx/openai@0.4.1` and `@kortyx/hooks@0.24.0`.

| Surface | Evidence | Implication and scope |
| --- | --- | --- |
| All six providers | Each `providers/*/src/errors.ts` defines message-only request/configuration errors; HTTP clients consume error bodies without retaining structured status/headers | One shared provider failure contract, applied to OpenAI, Anthropic, Google, DeepSeek, Groq and Mistral; invoke and stream paths |
| OpenAI Responses | `providers/openai/src/responses.ts` already attaches usage/finish metadata to some response failures and identifies refusals with `content-filter` | Preserve existing metadata; add missing classification without claiming every failure currently lacks metadata |
| Model/schema validation | `packages/hooks/src/validation.ts` replaces `safeParse` failures with `Error`; `reason/parsing.ts` creates prose-only parse/truncation errors | Typed validation codes and safe issues, with context identifying model output versus application input or other hook validation |
| Reasoning accounting | `reason/use-reason.ts` accumulates usage before schema parsing; `reason/engine.ts` also accounts for provider failures with usage | Enrich errors without charging usage twice or inventing usage when unavailable |
| Child calls and parallel groups | `packages/hooks/src/workflow.ts` stores `error?: string` and drops the cause immediately; `parallel.ts` already preserves settled-result order | Persist failure descriptors and reconstruct usable child errors; preserve existing ordering, success caching and call identity |
| Direct execution | `packages/agent/src/execution/execute.ts` exposes only `{ code, message }`; `execution/types.ts` formalizes that shape | Extend failed outcomes so an external executor receives the same safe facts as code inside the workflow |
| Request/contract handling | `execution/contracts.ts` maps any workflow lookup exception to `UNKNOWN_WORKFLOW`; resume wrapping maps other exceptions to `INVALID_RESUME` | Preserve infrastructure failures instead of mislabeling them as application input errors; keep request rejection distinct from accepted execution failure |
| Runtime/orchestration | `orchestrator.ts` rebuilds emitted errors from a message and writes message-only error chunks; checkpoint/registry failures are often generic errors | Preserve identity/context across emit, transition, pause-save and terminal paths; identify actionable persistence and contract failures |
| Tools/MCP | `hooks/src/reason/tools.ts` converts thrown tool errors to text for model feedback, UI and trace events; MCP also has explicit `isError` results | Keep model feedback, developer diagnostics and tool-result semantics distinct; retain safe diagnostics without turning every tool error into a terminal run failure |
| Cleanup precedence | The tool loop awaits `closeOwnedTools()` in `finally`, and that helper uses rejecting `Promise.all` | A close failure can mask the primary failure or control-flow exception; preserve primary outcome and report cleanup separately |
| Streaming/buffering | `StreamChunkSchema` defines message-only failures; `consumeStream` rebuilds plain errors; `StreamResultSchema` separately permits arbitrary `cause`; buffered results retain chunks | Add a consistent safe failure field and remove reliance on arbitrary wire causes; preserve buffered shape and error chunks |
| Stream parsing | `stream/src/client/read-stream.ts` logs malformed JSON payloads and skips them | Surface malformed known protocol data as an actionable stream failure; never silently present a corrupted stream as successful |
| HTTP and React | Agent route handlers default all caught errors to HTTP 400; route/checkpoint clients discard status/details; `use-chat.ts` rebuilds `Error(message)` | Preserve safe descriptors and status through HTTP/SSE and React; distinguish invalid commands, server failures and intentional aborts |
| Telemetry/OTel | `telemetry/src/event-mapper.ts` retains only name/message; `otel/src/span-wrapper.ts` records raw exceptions and sets error status | Add safe code/category/correlation and control-flow-aware reporting; audit existing error-text exposure rather than expanding it |
| Studio/read models | Run detail reads message text; trace/event stories recognize control flow by names/codes; API client drops server error code/request ID | Show code, cause summary and relevant provider/validation context; preserve historical events and control-flow presentation |
| API/CLI | `apps/api/src/errors.ts` already has safe generic 500 responses and auth handling; CLI topology errors embed raw HTTP response text | Retain existing API conventions while preserving codes/request IDs in consumers; bound CLI diagnostics and remove raw-body fallback |
| Operational failure isolation | Telemetry delivery has its own status-aware queue/retry policy; reporter errors are intentionally isolated from workflow execution | Keep delivery policy separate and non-fatal; do not convert every swallowed best-effort failure into an execution error |
| SDK placeholder | `packages/sdk` currently contains package metadata, with no runtime source | No new SDK implementation needed for this PR |

## Contract design to implement

### Common foundation

Use one browser-safe, dependency-light error module. Recommended home: a dedicated `@kortyx/core/errors` entry point, with public re-exports from `kortyx` and the appropriate browser entry points. Keep it independent of providers, graph-engine internals, server loaders and telemetry to avoid package cycles and Node imports in browser bundles. Providers currently have no core dependency, so dependency, bundling and publication changes must be verified explicitly.

Provide a public error base/descriptor, normalization/serialization helpers and structural type guards. Public decisions use stable codes and validated descriptors; `instanceof` may remain convenient but must not be required after JSON transport, across package copies or across process restarts. Preserve existing exported `WorkflowCallError`, `ParallelError` and `ExecutionRequestError` identities and established request codes.

The descriptor must support:

- A version, stable code, category and bounded safe message.
- Source/operation and available correlation: workflow, node, child call, provider/model, run, request or trace identifiers. Identifiers must be validated/bounded; never serialize runtime context wholesale.
- Provider HTTP status and a normalized Retry-After delay when available. Distinguish provider status from the HTTP status of the application/Studio API response.
- Transient retry eligibility with an explicit unknown state. Schema repair remains a separate failure category, with no shared retry counter or automatic recovery implication.
- Safe schema issues, available normalized usage and finish metadata.
- Bounded nested failure descriptors for causes, child failures and aggregates. Live errors may additionally preserve the actual original `cause`.

Name the concrete public classes/fields once in the implementation and use those names consistently across types, schemas, docs and UI. Avoid adding a separate envelope per package.

### Failure taxonomy

Define stable codes for known actionable public boundaries: provider configuration, HTTP rejection, transport failure, refusal, invalid provider payload, invalid model JSON, model output schema mismatch, output truncation, invalid command/input, workflow contract mismatch, child/domain failure, checkpoint/store failure, malformed stream and unknown/internal failure.

Keep application codes in an explicit domain field/namespace or validated application-failure contract. A domain string cannot impersonate a Kortyx control-flow signal. A wrapper must expose the underlying failure facts rather than replacing every code with `WORKFLOW_FAILED` or `EXECUTION_FAILED`.

408/429/5xx are transient candidates under the requested default classification; 400/401/403, refusals and malformed payloads are separate categories. Allow structured provider error codes to refine classification, including terminal reasons returned under otherwise transient HTTP statuses. Network failures without HTTP status remain identifiable. Unrecognized conditions remain unknown; never infer categories from message prose.

Do not classify every malformed JSON fragment as confirmed output-length truncation. Use finish/provider evidence where available and preserve uncertainty otherwise. A custom schema returning a validation failure and a schema callback throwing a programming error are different failures.

### Exposure and safety

There are three representations with different exposure rules:

1. Live server errors retain original causes and diagnostic information for trusted application code.
2. Checkpoints store only a versioned, bounded, JSON-safe failure descriptor. Domain details require explicit application opt-in to safe fields.
3. HTTP/SSE, model tool feedback, logs and telemetry use their documented exposure projection. Browser messages may be more limited than persisted developer diagnostics.

Use allowlists at each boundary. Never automatically traverse raw request/response objects, stacks, headers, environment, prompts, tool arguments/results, resume tokens or arbitrary error properties. Arbitrary `Error.message`, validation messages, field paths and custom domain details can themselves contain secrets; field selection and truncation alone do not guarantee safe content. Unknown errors need a generic public message and correlation reference; richer application text must be explicitly declared safe. Preserve causes in memory without making `JSON.stringify(error)` an accidental disclosure path.

Define and test named limits for message length, issue count, nesting/cause depth, string values and total serialized bytes. Serialization must handle cycles, non-Error throws, non-finite values, BigInt, accessors and hostile `toJSON`/`toString` implementations without masking the primary failure. Truncation must be explicit. For parallel groups, preserve every ordered fulfilled/rejected slot within existing call-count limits; trim diagnostic detail rather than dropping members.

## Implementation work packages in one PR

1. **Contracts and exports:** shared module, typed error constructors/guards, safe projection/serialization, public schemas and a small documented error-code catalogue. Add compatibility fixtures before propagating it.
2. **Failure producers:** all six provider HTTP/invoke/stream paths; `useReason` JSON/schema/truncation paths including tool-assisted and interrupt continuation output; root/child contract validation, registry and runtime persistence boundaries. Preserve available usage and causes exactly once. Include actionable setup messages for missing keys, unregistered workflows, stale contracts and unavailable persistence.
3. **Runtime propagation:** child failure records, nested/parallel reconstruction, orchestrator error events, transition failures, direct execute/resume outcomes, pause-save and cleanup failure precedence. Use the same source descriptor through wrapping; do not concatenate a repeated prefix at every layer. A secondary cleanup/reporting failure must not erase the original execution failure.
4. **Transports and React:** additive safe error details on existing message-bearing chunks, HTTP failure responses, client error objects and callbacks/content pieces. Keep buffered `{ chunks, text, structured }` responses and legacy message rendering. Handle malformed protocol data explicitly, preserve partial output as partial, and distinguish intentional abort from network/protocol failure. Once streaming starts, report failure through the stream; do not pretend the HTTP status can change afterward.
5. **Tools and retry boundaries:** attach safe tool failure details while retaining existing model-feedback/`isError` behavior. Verify root cancellation, limit suspension and human interrupt propagation before ordinary error normalization. Audit the public `withRetries` helper, which currently retries everything by default and does not guard control flow; exclude Kortyx control flow and support cancellation without introducing an automatic model/child recovery engine. Keep generic node retry defaults for ordinary failures; document that selective application recovery must use classification rather than broad node retries. Deliberate child retries require distinct stable attempt IDs because failed calls remain cached.
6. **Observability, Studio, API and CLI:** consistent safe code/category/correlation on error events and spans; actionable detail in existing Studio run/trace views; preserve API request IDs and codes in Studio clients; bounded code/message/context output at CLI error boundaries. Align relevant known API error mappings, including not-found cases, while retaining auth and generic internal-error protection. Keep telemetry delivery and best-effort reporter isolation intact. No new Studio recovery buttons or workflow controls.
7. **Documentation and release:** developer error-handling guide, provider/hook/child/execution/stream reference updates, public examples, repository Kortyx skill references and coordinated package changelogs/releases. Document migration, exposure rules, old checkpoint limitations and application-owned retry/correction policy.

## Compatibility and operational implications

| Concern | Required decision/behavior |
| --- | --- |
| Existing messages and shapes | Keep `.message`, existing request codes, `WorkflowCallError.workflow`, `ParallelError.results/errors`, `ExecutionResult.status` and legacy wire fields. Add structured fields rather than replacing strings with objects in place. Message text is for humans and may improve; publish changed sensitive-message defaults explicitly. |
| Old checkpoints | Read existing message-only child records as legacy/unknown failures. Previously discarded status/domain issues cannot be reconstructed. Do not make a cached old failure retryable by guessing from prose. New descriptors need explicit version handling. |
| Rollback/mixed workers | Prefer retaining a safe legacy message alongside the new descriptor. New readers understand old records; old readers may only see the safe fallback. Do not claim recovery parity with mixed old/new workers or old records; ensure deployment/resume routing uses upgraded workers. |
| Old clients and events | Accept message-only stream/API/telemetry payloads and unknown future codes. Verify schema parsing does not strip the new fields. Preserve legacy Studio control-flow recognition while adding the new contract. |
| Legacy wire cause | Retain source compatibility where an old type allowed `cause`, but do not populate it with arbitrary exception objects. Treat received legacy causes as untrusted data; the new validated safe descriptor is the supported propagation contract. |
| HTTP defaults | Distinguish request errors from server failures. Honor an explicitly configured `errorStatus`; document/test any default status correction. Do not forward a provider's HTTP status as if it always described the caller's HTTP request. |
| Retry and spending | Do not start additional calls merely because errors now carry retry eligibility. Each actual model dispatch uses existing shared execution accounting; correction does not create a new allowance. Keep cancellation responsive during backoff. |
| Token and completion accounting | Known usage from failed/invalid output remains accounted once; unknown usage remains absent. A failure after partial output is not completion, and `done` signifies stream termination rather than business success. Preserve completion/background-work lifetimes. |
| Persistence costs | Bound nested errors and metadata to avoid checkpoint growth. Keep success payloads and existing workflow checkpoint layout intact except for additive failure records. |
| Telemetry | Use existing JSON event payloads where possible; no database migration is assumed. Preserve event names/schema compatibility and historical reads. Do not turn interruptions into error-rate regressions or reporter failures into failed runs. |
| Browser/package graph | Shared exports must work from browser entry points without Node loaders or graph runtime. Use the existing release-please workspace process; this spans multiple published packages, not just three version bumps. |

The changes to safe public messages, default HTTP classification, malformed-stream handling and retry control-flow guards are observable behavior changes even if TypeScript fields are additive. Call them out in release notes and migration tests; do not label the entire PR behavior-neutral.

## Verification and release gates

| Test group | Required positive evidence |
| --- | --- |
| Shared contract | Structural guards and JSON round trips; bounded safe projection; cyclic/hostile/non-Error values; explicit domain opt-in; cause identity retained only in memory; unknown and legacy fallback |
| Provider conformance | All six providers, invoke and stream: 408/429/503, terminal 400/401/403, network errors, missing/malformed Retry-After, refusal/incomplete/malformed payload and midstream failure where supported; status/code/cause/usage assertions, not message-only checks |
| Structured output | Valid JSON with schema mismatch exposes issues and finish/usage; parse error versus evidence-backed truncation; normal, tool-assisted and interrupt continuation paths; programming errors remain distinguishable |
| Application recovery fixture | One permitted transient retry succeeds; one deliberate schema correction succeeds; exhausted attempts stop; authorization/refusal do not trigger recovery; counters remain separate and no implicit allowance is granted |
| Child persistence | Sequential and nested child domain/provider/validation errors retain descriptors; parallel group has a failed child, successful sibling and waiting sibling; reconstruct with real Redis, resume, and assert ordered rich outcomes and no duplicate work/usage |
| Replay compatibility | Legacy message-only records, new records, later parent interrupts, distinct stable retry attempt IDs, fork/rollback independence and checkpoint failure during suspension |
| Control flow | Root/local cancellation, tool cancellation and backoff cancellation; all execution limits and human interrupts through direct, child and parallel paths; no serializer, wrapper, retry helper or UI classifier turns these into ordinary recoverable errors |
| HTTP/SSE/React | New and legacy bodies/chunks, checkpoint failures, explicit status override, safe correlation, buffered response compatibility, malformed JSON, truncated stream, partial output then error, one terminal sequence and intentional disconnect handling |
| Tool/MCP | Explicit `isError` result versus thrown tool failure; safe model feedback and developer detail; primary failure survives cleanup; approval and budget signals retain their semantics |
| Studio/telemetry/CLI | Safe code/category/request IDs visible; old events render; cancellation/interrupt/limit states remain distinct; private content excluded; CLI exits nonzero with actionable bounded diagnostics; reporting failures cannot fail the workflow |
| Distribution | Public type/export checks, browser bundle smoke test, dependent package builds, coordinated release versions and examples using the public API |

Extend existing suites rather than creating a separate test system: provider client/Responses/conformance tests and `providers/test-compatibility.ts`; hooks reason/validation/workflow tests; agent execution/child/parallel/control-flow/HTTP tests; stream client-server tests; React use-chat/transport tests; telemetry/OTel tests; Studio trace/read-model tests; API and CLI tests. Add durable failure fixtures that assert the fields this review found missing.

CI already declares a Redis service and `KORTYX_TEST_REDIS_URL` in `.github/workflows/ci.yml`. Verify this variable reaches the actual test processes and the new durable tests run; an all-green suite with Redis cases omitted is not a release gate. Run the repository's required coverage, build, typecheck and lint checks for implementation, plus relevant Studio browser verification.

The consumer's `test/goal-provider-parity.test.ts` and `UPSTREAM-RECONCILIATION.md` are absent from this checkout. Kortyx should provide positive contract/recovery fixtures here; the consumer must replace its blocker reproductions with positive tests and verify its production policy before switching callers.

## Explicit exclusions

- A new automatic retry/repair engine, circuit breakers, provider fallback routing or automatic execution-limit continuation.
- Rewriting application policies, its specialist/domain taxonomy, or its transient request-state workaround in this repository.
- Persisting arbitrary exception instances, raw provider responses or application secrets; rebuilding original JavaScript prototypes after restore.
- A product-wide logging framework, exhaustive rewrite of internal error prose, new telemetry delivery scheduling, Studio error-search/filter features, or new database indexes.
- General parser/protocol redesign, new parallel scheduling semantics, exactly-once side effects, or unrelated migration work.
- Publishing releases, opening a PR or switching production callers during this scoping task.

## Assessment evidence and delivery size

This is a substantial cross-package PR with seven ordered implementation work packages. The common contract makes one PR coherent, but each package should have an independently reviewable commit and focused tests. If implementation reveals a need for unrelated UX, database or recovery-engine changes, defer those rather than expanding this contract PR.

The initial review ran 135 existing targeted provider/hooks/agent tests successfully. Redis was not enabled in that local run. The broader assessment above is source inspection, not execution of every listed failure scenario. No production recovery-parity claim follows from the existing passing tests. The implementation now includes the shared contract, package integrations and positive recovery fixtures. See [release notes and rollout](./error-contract-hardening-release.md) for migration and publication requirements.
