# Error contract: example and compatibility verification

Verified locally on 2026-09-14. Nothing was published or switched in the consuming application.

## Coverage matrix

| Surface | Evidence |
| --- | --- |
| API Route example | 34 deterministic tests passed, including actual routes, workflows, hooks and Google adapter; only provider HTTP and telemetry are substituted. |
| Server Action example | 9 runtime tests passed. This example previously ran type checking without runtime tests. |
| Canvas example | 128 tests passed, including classifier-to-chat success and typed classifier/schema failures. |
| Production browser builds | 15 Chromium checks passed across all three examples: 503 and 401 display safe failures, a subsequent turn succeeds, malformed provider streaming retains partial text with an error, and no uncaught browser exceptions occur. Error text is asserted fully inside the viewport. |
| Redis and a restarted HTTP worker | Existing seven-check parallel E2E exercises concurrent children, ordered join, approvals, restored distinct answers, cached completed work, consumed handles, shared limits/Continue, child failure and invalid input. |
| Live OpenAI | 10 enabled tests passed: Responses invoke/stream/tool rounds, memory and Redis approvals, limits/Continue, cancellation, legacy Chat Completions, missing model and incomplete output usage. |
| Live Google/MCP | The approval and resumed tool execution test passed after fixing approval metadata. |
| Persisted error compatibility | New and legacy message-only nested child failures tested after memory and Redis reconstruction; ordered parallel results preserve completed work without repeating children. Legacy retryability stays unknown. |
| Full SDK coverage | 1,019 tests passed; six pre-existing hook tests skipped. All configured coverage thresholds passed, including the strict core, agent, runtime, stream and utility gates. |
| Build and static checks | All 27 workspace build tasks passed. Workspace type checks, lint and diff whitespace checks passed; lint retains non-failing warnings. |

Deterministic provider failures cover 408, 429, 503, 400, 401 and 403, Retry-After, schema issues/usage, pre-execution persistence errors, malformed requests, and one terminal stream marker. Fetch counts assert that transports do not introduce retries. The SDK policy fixture separately verifies one allowed transient retry and one schema correction, exhaustion, terminal authorization/refusal failures, and the existing shared allowance.

The browser fixture intercepts Google HTTP only in an isolated test process. It supplies no real credentials and disables Redis/telemetry environment settings for those browser checks. Real Redis tests use isolated namespaces/services. Live-provider tests are separate from deterministic failure simulation; the run does not claim to induce actual provider outages.

## Regressions found and fixed

- Custom example routes bypassed safe failure serialization. They now use shared `readRequestJson` and `createFailureResponse`; the chat example uses the standard route adapter. Accepted execution outcomes keep their existing response semantics.
- Server Action pre-execution failures could surface as a Next.js digest instead of actionable chat errors. The action now returns safe error and completion chunks.
- Tool approval metadata was passed inside the request object, then overwritten by the interrupt helper. It is now passed through the supported `meta` field, with deterministic and live regression evidence.
- Expired/consumed/mismatched resume handles still threw plain errors. Typed request failures preserve HTTP 400 rejection when using the shared status mapping.
- Shared provider error constructors initially narrowed the old inherited `Error` signature. Optional messages and standard causes are preserved.
- Both Next.js chat examples only scrolled on mount. In longer conversations the final error could be below the visible chat area. They now follow new message/content updates, and browser assertions require the error text to be fully in the viewport.

The browser fixture initially assumed Canvas sent a provider-side JSON schema; Canvas requests JSON and validates locally. Fixing that test assumption made its successful classifier path pass without changing application behavior.

## Reproduce

```sh
# Build first; production browser tests require the examples' dist directories.
pnpm exec turbo build --filter='./examples/*'
pnpm -r --no-bail --filter './examples/*' test
pnpm test:examples:errors

# Starts/stops its own Redis and HTTP worker, including a process restart.
pnpm --filter @kortyx/example-nextjs-chat-api-route test:parallel:e2e

# Use a dedicated test Redis URL; never point fixture tests at production.
KORTYX_TEST_REDIS_URL=redis://127.0.0.1:16381 pnpm coverage
pnpm -r --if-present run type-check
pnpm lint
git diff --check
```

The browser runner uses the workspace's Studio Playwright dependency and an installed Chromium browser. Screenshots are written to `/tmp/kortyx-example-error-evidence` by default; set `KORTYX_EXAMPLE_EVIDENCE_DIR` to retain them elsewhere. Live tests require the existing example environment flags and provider credentials; they can incur model usage charges.

## Release limits

The change has intentional behavioral incompatibilities; see [the migration table](./error-contract-hardening-release.md#observable-compatibility-changes). New fields are additive, existing calls still compile across the workspace, and legacy records remain readable. Exact error prose, shared constructor identity, HTTP defaults, and stricter malformed-stream behavior are not transparent compatibility guarantees.

The live Studio ingestion test, PostgreSQL integration and live calls to the other four providers were not run. All six provider adapters have deterministic failure conformance tests. The consuming application's blocker tests and production policy are outside this repository and still require positive recovery verification against a coordinated package release.
