# Error contract hardening: release notes and rollout

This change is implemented locally. Package publication and the consuming application's production switch remain separate release steps.

## Developer-facing changes

- Shared `KortyxError`, `FailureDescriptor`, `serializeFailure`, `errorFromFailure`, `isFailureDescriptor`, `isControlFlowError`, `DomainError` and validation/provider error types are available through `@kortyx/core/errors`, `kortyx` and `kortyx/browser`.
- All six built-in providers preserve HTTP status, retry eligibility, Retry-After and live causes. Structured model-output failures preserve stable codes, validation information and available usage/finish metadata.
- Child checkpoints preserve bounded safe failure descriptors. Nested and parallel errors retain underlying domain/provider/validation classification after Redis restore, with ordered settled results and cached successful work.
- Direct execution, HTTP/SSE, buffered collection and React preserve the same descriptor. Studio displays diagnostic codes, upstream status, cause summaries and API request IDs. Tool feedback, CLI, logs and telemetry avoid copying arbitrary exception text or response bodies.
- Cancellation, execution limits and human interrupts remain control flow. Retry backoff supports cancellation. A model correction still consumes the existing shared allowance.

## Observable compatibility changes

**Treat this as a behavioral breaking release, not a transparent patch.** Existing method calls and legacy message fields remain supported, but applications depending on the old failure behavior need migration. Coordinate the pre-1.0 minor/dependency release through release-please and mark the breaking behavior in the release notes.

Public unknown-error messages are now generic. Use codes and safe metadata for policy; inspect the live server error/cause for trusted debugging. Applications explicitly opt into persisted domain messages/details using `DomainError`. Validation issue messages and string field names are omitted from persisted diagnostics; original issues remain available on the live validation error.

Default HTTP statuses now distinguish request validation (400/404), provider failures (502), persistence failures (503) and unknown server failures (500). Explicit `errorStatus` overrides still apply. Malformed or incomplete SSE data fails explicitly instead of being logged and silently skipped. Generic retry helpers no longer retry control-flow exceptions. These behavior changes need release notes even though the new descriptor fields are additive.

Legacy message-only checkpoints and clients remain readable. Lost metadata cannot be recovered from old checkpoints; retryability is never inferred from prose. A new deliberate child attempt needs a distinct stable call ID. No new retry engine, schema-repair policy or execution allowance is enabled by this release.

| Existing dependency | Required adjustment |
| --- | --- |
| Matching arbitrary `.message`, provider response prose, or a custom plain error's `.code` after persistence | Match the stable descriptor code/category; use `DomainError` to explicitly preserve safe application metadata. |
| Treating all route errors as HTTP 400 | Handle the typed status mapping. A workflow failure after execution starts still uses the existing HTTP 200 result/SSE envelope. A missing read-only checkpoint lookup still returns HTTP 200 with `null`. |
| Custom SSE producers relying on ignored bad events or closing a nonempty stream without completion | Emit valid events and a `done` chunk or `[DONE]` marker; handle malformed/truncated stream failures. |
| Using a provider package's error constructor identity to identify the provider | Constructors are now shared across providers; use available descriptor `source` or the configured model/provider identity. No-argument constructors and standard `ErrorOptions.cause` remain supported. |
| Retrying every exception, including interrupts, limits or cancellation | Preserve control flow; apply retries only to the intended ordinary failure categories. |
| Strict exact-shape JSON validation of error envelopes | Permit the new optional failure metadata while continuing to read legacy message fields. |

Provider refusals and malformed output now produce explicit failures. Safe tool feedback and validation diagnostics can change the text supplied to models; applications with deliberate schema correction should use the typed metadata and their own correction prompt. Live validation causes/issues remain available for trusted server-side use.

## Coordinated package release

Use the existing release-please node-workspace process to generate versions, dependent-package bumps and changelogs together. Do not manually publish individual packages at the old versions.

| Package group | Changelog entry |
| --- | --- |
| `@kortyx/core` | Add browser-safe typed failures and bounded serialization |
| `@kortyx/providers`, OpenAI, Anthropic, Google, DeepSeek, Groq, Mistral | Preserve provider HTTP and failure classification across invoke/stream |
| `@kortyx/hooks`, `@kortyx/runtime`, `@kortyx/agent` | Preserve validation and child failures across execution/checkpoints; keep control flow and spending intact |
| `@kortyx/stream`, `@kortyx/react`, `@kortyx/utils` | Carry safe failures through transports and exclude control flow from retries |
| `@kortyx/telemetry`, `@kortyx/otel`, `@kortyx/cli` | Emit bounded actionable diagnostics without raw exception/body exposure |
| `kortyx` | Re-export the contract and consume the coordinated dependency versions |
| Studio, API, website and repository skill | Explain/display the contract and migration behavior |

Release automation may bump additional dependent packages. Deploy upgraded workers consistently before relying on restored metadata; mixed old/new workers are not recovery-parity evidence.

## Consumer acceptance still required

`test/goal-provider-parity.test.ts` and `UPSTREAM-RECONCILIATION.md` belong to the consuming application and are absent here. Replace its known-blocker assertions with positive policy tests against the released packages. Verify its one transient retry, one schema correction, specialist taxonomy and production Redis restore before switching affected callers. Kortyx's fixture proves the shared contract and accounting, not the application's complete production policy.

Live OpenAI and Google/MCP tests passed during example verification. Live Anthropic, DeepSeek, Groq and Mistral calls, PostgreSQL integration and the live Studio ingestion test were not run in this verification. The local Studio browser smoke uses an isolated API failure fixture; it does not substitute for the complete database-backed Studio E2E suite.

## Local verification, 2026-09-14

See [the example verification report](./error-contract-example-verification.md) for the expanded production-browser, real-provider and process-restart matrix, regressions discovered, and reproducible commands. The original verification below preceded that additional work.

- `pnpm coverage` with a dedicated local Redis instance: 1,011 tests passed; all configured coverage thresholds passed. The new fixture includes nested domain/provider/schema failures after Redis reconstruction, ordered parallel results, bounded application recovery and preserved execution allowances.
- `pnpm build`: all 27 build tasks passed, including packages, providers, Studio, website and examples.
- `pnpm -r --if-present run type-check`: workspace checks passed.
- `pnpm lint` and `git diff --check`: passed; lint still reports non-failing warnings.
- API and Studio unit suites: 66 tests passed. Canvas workflow regressions: 122 tests passed.
- `kortyx/browser` bundled for the browser and executed successfully with the shared failure contract; its dependency graph contains no Node runtime modules.
- Headless Chromium verified Studio's error page against an isolated HTTP 503 fixture: safe message, stable code, request ID and HTTP status rendered correctly.
