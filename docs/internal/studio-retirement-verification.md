# OSS Studio retirement: local verification

Date: 2026-10-18. OSS changes on `codex/eval-worker-drain`.
The user has authorized a public pull request; the local results below predate
that push. Required final-head public CI remains pending. Production changes,
private pushes/CI and publication are outside this PR; this is not a deployment
receipt.

## Exact release and container verification

The baseline is the permanent [Studio 0.22.0 release manifest](https://updates.kortyx.io/studio/releases/0.22.0.json),
not a moving `latest` image. Its deployment strategy is `recreate`.

| Artifact | Exact baseline |
| --- | --- |
| Studio/API release | `0.22.0`; local `studio-v0.22.0` tag points to `a2ebdbc35bfcf3dc55472f6429e4d53a5135795b` |
| API image | `ghcr.io/kortyx-io/kortyx-api@sha256:69303e117998aa0035ec2f96eb5b113f5522eacabfb188a25162fb98461cd9d3` |
| Studio image named by that manifest | `ghcr.io/kortyx-io/kortyx-studio@sha256:81ad10bddd76b680357cce05c868b453cf9f985684a75e4bd37d09ea0b961926`; its browser/container was not exercised by this slice |
| Published SDK facade | `kortyx@0.32.0` |
| Published agent/runtime | `@kortyx/agent@0.39.0`, `@kortyx/runtime@0.25.0` |
| Node in released/candidate API containers | `v22.23.3` |
| Local ARM64 candidate | `sha256:172c630a528456e09e88e605f0fe7dc9109c711798d502b43cb0fb0fbad69cf8` |
| Local AMD64 candidate | `sha256:3445e71573abb83e869469bdef4a14cf24c1ec5722fb5bd300a110aa8de72e70` |

Both candidates were built locally from the **actual `apps/api/Dockerfile`**,
including the image entrypoint, privilege drop, bundled Compose, frozen workspace
install and dependency build. These are local verification images, not CI-issued
release artifacts. The checkout base is `438dac5a6e7d7ff008a203d4482158e272842fc1`
plus the unpublished changes in this worktree. The eight relevant lifecycle,
execution, store and entrypoint source hashes inside the image are checked against
the workspace. The candidate still has the old package manifest version strings;
**those published versions do not contain these new draining features**. New
coordinated releases must receive their own versions before these hooks are
advertised as available from npm or the stable image channel.

The published SDK was installed independently under ignored
`node_modules/.cache/kortyx-retirement-release`, with lifecycle scripts/audit/fund
requests disabled. Its three exact registry versions and SHA-512 tarball
integrities match the isolated npm lock. That lock's SHA-256 for this rehearsal is
`f2eae81e9791b0238d860a0e0f8567b4218a8eb0207aceb845122848e6e1479d`.
The consumer fixture loads the genuine published `kortyx` facade, `createEvals`
and route handler, rather than passing a current runner to an old route handler.

| Local scenario | Observed result |
| --- | --- |
| Released API + released SDK | Authenticated discovery/submission, both cases, app judging and durable Passed outcome. |
| Released API + candidate consumer | Both cases complete with one execution each; existing wire contract remains usable. |
| Candidate API + released SDK | Real Docker SIGUSR2 prepares while HTTP/auth remain available; active evaluation completes, queued evaluation survives API exit, standalone replacement finishes it once. |
| Candidate API + candidate SDK | Long-running Compose and explicit-abort cases exercise the new runtime together. |
| Candidate agent + published runtime 0.25.0 store | Ordinary evaluation completes once. Graceful drain explicitly rejects missing `queued`/`claimQueued`, confirming the need to upgrade the pair. |
| Released 0.22.0 SIGTERM during a suite | Container can exit 0 even though only the first case executed; the suite is not complete. Expired ownership is reconciled as Error without replay. Process exit 0 is not an eval retirement receipt. |
| Released 0.22.0 SIGUSR2 | Under Linux PID 1 it is ignored: a separately queued evaluation is still claimed and completed while the held evaluation remains active. It is not a preparation fence. Different hosting can terminate an unhandled signal instead. |
| New entrypoint and worker override | Native Linux ARM64 executes Node as PID 1 and UID 1000, including `node apps/api/dist/eval-worker.js`; no signal-swallowing shell remains. |
| Compose `stop_grace_period: 45s` | Worker stays alive with active ownership beyond 31 seconds, keeps a separate API available, completes both cases and cleanup, persists Passed, reports drained and exits 0. ARM64 rehearsal: about 32.5 seconds from stop request to completed check. |
| Supplied default `stop_grace_period: 30s` | Real Compose stop force-kills the still-active worker, exit 137, not OOM. No drained confirmation. Reconciliation becomes Error, only first case ran, no replay. ARM64 elapsed check including reconciliation: about 32.9 seconds. |
| Docker SIGINT | Explicit abort state, no drained confirmation. No claim of preserving the consumer's independently running job after abrupt ownership loss. |
| Updater privilege/ownership | Both previously skipped root/Linux ownership tests pass inside the candidate image; 2 on native ARM64 and 2 on emulated AMD64. |

The complete Docker proof also passes on AMD64 under local Rosetta emulation:
45-second grace preserves the suite and exits 0 after about **33.1 seconds**;
30-second grace kills it with exit 137 after about **30.8 seconds** including the
reconciliation check. Released/candidate combinations, legacy-signal behavior,
new preparation/replacement and explicit abort pass on that architecture too.
Both image builds and all four root/Linux ownership checks pass. The independent
published-runtime compatibility script passes. These are additional local checks;
the earlier 603 SDK / 165 API / 77 integration results are retained rather than
presented as freshly rerun in this image-verification follow-up.

Ignored receipts are `container-verification-arm64.json`,
`container-verification-arm64-no-grace.json` and
`container-verification-amd64.json` in the isolated cache. The first ARM64 full
proof covers the two grace periods; its short follow-up covers old-image signals
and source hashes for the same immutable image. The AMD64 receipt includes all
scenarios and matching source hashes in one run.

The 45-second value is deliberately only a test setting. Long evaluation deadlines
and cleanup can exceed it. Production needs preparation plus verified completion,
or a platform lifetime covering the actual work; increasing a fixed grace period
alone does not orchestrate retirement. Saved installer Compose files do not gain
new settings merely by replacing the image. Inspect the effective stop timeout.

The first upgrade from 0.22.0 needs a verified submission fence, settled queued
work and completed active evaluations before old processes are retired. Do not
send the new preparation signal to legacy images or overlap their workers under
the assumption that they enforce the new shared budget. No telemetry migrations
or eval wire schema changes occur between the tagged baseline and this patch.

Reproduce locally, with Docker Desktop/local Unix socket only:

```bash
node apps/api/scripts/prepare-retirement-release.mjs
node apps/api/scripts/prove-runtime-compatibility.mjs

docker pull ghcr.io/kortyx-io/kortyx-api@sha256:69303e117998aa0035ec2f96eb5b113f5522eacabfb188a25162fb98461cd9d3
docker buildx build --platform linux/arm64 --load -f apps/api/Dockerfile -t kortyx-retirement-candidate:local-438dac5a .
node apps/api/scripts/prove-container-retirement.mjs kortyx-retirement-candidate:local-438dac5a

docker buildx build --platform linux/amd64 --load -f apps/api/Dockerfile -t kortyx-retirement-candidate:local-amd64-438dac5a .
node apps/api/scripts/prove-container-retirement.mjs kortyx-retirement-candidate:local-amd64-438dac5a
```

The container proof creates scope-labelled containers and a private Docker user
network, publishes only random loopback ports, uses tmpfs PostgreSQL, real API-key
authentication with fake credentials and deterministic provider-free executions.
It checks ownership before removing its own containers/network/volumes. Images
and ignored release/lock/JSON receipts remain cached for inspection. An initial
internal-network setup could not publish host ports and was corrected to a normal
scoped bridge; its two temporary anonymous volumes were traced through Docker
events and removed individually. No broad cleanup or shared-resource reset ran.

The native host is macOS ARM64. AMD64 runs through Docker Desktop Rosetta, which
appears in `/proc/1/cmdline`; the proof recognizes and records that wrapper rather
than claiming native AMD64 process layout. This is not an actual Hetzner/Coolify,
ECS or Kubernetes termination receipt. The Studio browser, private Cloud adapter,
final CI head, published future version numbers and CI image attestations remain
separate release gates. No image was pushed, no CI was triggered and no production
configuration changed.

## Affected surfaces and acceptance criteria

The implementation changes the OSS API host, adds a separate worker entry point
to the existing image, tightens the default PostgreSQL worker store and forwards
configuration through the local/installer/external-database Compose templates.
It also adds consumer SDK draining with optional scoped queue capabilities on the
public execution-store contract. Private adapters and deployment orchestration
are outside this public diff.

| Case | Expected behavior and local evidence |
| --- | --- |
| Strict single worker | Built embedded API receives real SIGUSR2; held evaluation finishes both cases; queued run survives process exit and executes on the subsequently started standalone worker. |
| Queue delay | A queued run waits longer than its 2-second execution budget and then passes; queue waiting is distinct from execution. No queue-age SLO is claimed. |
| Queued cancellation | Authenticated cancellation persists `cancelled`; consumer never executes the cancelled suite. |
| Live operation during preparation | API readiness remains 200; eval result read, prompt-resolution endpoint request, committed ingestion with same-ID duplicate retry, and actual PostgreSQL-backed SSE invalidation continue. Anonymous read remains 401. |
| Compatible overlap | Two actual worker processes share a one-group budget; queued work waits, old owner renews its lease through repeated SIGTERM, both suites complete with one execution per case. |
| Group ownership races | Eight concurrent database claimers admit one group, including two sibling suites. Finishing one sibling does not free the group slot; finishing the last does. |
| Failed candidate | Candidate with empty targets exits nonzero; original owner remains ready and processes existing and queued jobs. This tests host-side sequencing, not a production deployment controller. |
| Active cancellation | Separate API remains available; cancellation reaches the draining owner and persists a cancelled result; no second case starts. |
| Crash | Actual SIGKILL leaves consumer outcome uncertain. Expired lease is reconciled on another worker's claim pass; no automatic duplicate execution. Expiry is advanced in fixture SQL rather than waiting 30 seconds. |
| Lost lease / unconfirmed completion | Expired ownership cannot be renewed or acknowledge terminal persistence. Worker retirement reports failure, stays unready and does not emit `drained`; another owner reconciles the error. |
| Worker clock skew | An hour-skewed worker clock does not change database lease authority; heartbeat expiry uses PostgreSQL time. |
| Built-in updater | Configured targets, target files, non-self-hosted profiles, malformed configuration and unreachable/ambiguous checks fail closed before pull/stop/migration. Automatic updates pause. Native Node guard checks print no configuration or secrets. |
| HTTP/work ordering | Unit barriers prove HTTP can finish before evaluations or vice versa; database remains open until both finish. HTTP timeout does not abort evaluation work. |
| In-flight claims and heartbeats | Unit barriers include a claim resolving after drain starts and a heartbeat still pending after results finish. Retirement waits for both. |
| Deadlines and explicit abort | Existing worker tests exercise frozen execution deadlines, cancellation, explicit `stop()` escalation, late claims after abort and ambiguous claim/completion failure. |
| Repeated signals and recovery | Lifecycle tests cover repeated signals, irreversible preparation, abort racing with termination, and explicit abort after failed retirement. No automatic forced abort on a deployment wait timeout. |

The sixteen process/database cases live in
[`eval-retirement.integration.test.ts`](../../apps/api/test/eval-retirement.integration.test.ts).
Worker and host unit regressions live in
[`eval-worker-drain.test.ts`](../../apps/api/test/eval-worker-drain.test.ts) and
[`lifecycle.test.ts`](../../apps/api/test/lifecycle.test.ts).

## Reproduce locally

Build the API and its dependencies first. The runner requires an already-present
`postgres:17-alpine` image and a local Unix-socket Docker context. It creates a
randomly named, scope-labelled, loopback-only PostgreSQL container in tmpfs,
migrates only a disposable database, launches built Node processes and a real
SDK consumer endpoint with deterministic answers, then cleans up those resources.
No real project, service key, model or consumer endpoint is used. Fixture teardown
may explicitly abort/kill its own disposable child processes; this is not a
production retirement policy.

```bash
pnpm exec turbo run build --filter=@kortyx/api...
node apps/api/scripts/prove-retirement.mjs --regressions
pnpm --filter @kortyx/api test
pnpm --filter @kortyx/telemetry-db type-check
pnpm --filter @kortyx/cli exec vitest run test/studio-command.test.ts test/studio-local-images.test.ts
pnpm --filter @kortyx/cli type-check
```

The runner also exercises the consumer PostgreSQL execution store. The optional
`--regressions` flag runs the full runtime PostgreSQL coverage suite, existing
persisted evaluation suites in their own dedicated databases, real two-API
invalidation and stored execution-evidence recovery. Test DB startup probes TCP so PostgreSQL's temporary
initialization socket cannot produce a premature readiness result.

## Earlier worker-only results

- macOS host Node 24.11.1, PostgreSQL 17 in local Docker: seven process/database
  scenarios passed; deterministic SDK consumer used capacity four so a consumer
  singleton cannot hide a missing worker budget.
- API `test`: three profile checks and 162 tests passed; 42 opt-in/platform-dependent
  cases skipped without their opt-in environment. Selected database suites run
  separately in the disposable runner; skipped cases are not claimed as passing.
- CLI installation/image tests: 36 passed; CLI and telemetry-db type checks passed.
- API production bundle, including `dist/eval-worker.js`, built successfully.
- Targeted lint passes with non-null-assertion warnings in the integration fixture;
  quality gates have not been disabled.
- Final Node 22.14.0 rehearsal: all seven process/database scenarios passed,
  including worker startup without an API pepper and the clock-skew assertion.
  Existing persisted eval suites: 10 + 8 passed. Real two-API invalidation: one
  passed. Stored execution-evidence recovery: one passed. These 27 selected
  integration checks use disposable PostgreSQL; they are not a production load
  test or a production-image receipt.
- Final API and telemetry-db builds/type checks pass. YAML parses and Docker
  Compose contract checks pass for all three supplied templates. Updated relative
  doc/skill links, script syntax and `git diff --check` pass. The Node 22 runner's
  scope-labelled container and child processes were cleaned up.
- The two root/Linux updater ownership checks remain skipped on macOS; their
  fixture adapter was updated for the new updater guard, without claiming Linux
  execution coverage.

## Consumer retirement follow-up

The consumer hook stops new admissions synchronously, waits for in-flight
admission/claims and its own active jobs, and claims only a fixed scoped queued
snapshot. It preserves cancellation and observation, confirms terminal persistence,
waits outstanding heartbeats and rejects ambiguous retirement with bounded errors.
No jobs-v1, legacy stream, persisted schema or customer progress shape changed.
Default execution limits and direct `evals.run()` behavior remain unchanged.

| Additional case | Local evidence |
| --- | --- |
| Accepted active and queued jobs | All finish through teardown without host abort; new POST is 503 for jobs-v1 / 429 for legacy, with explicit non-acceptance. Authenticated discovery/read/cancel continue; unauthorized GET/POST/DELETE remain 401. |
| Admission and claim races | Late commit/ack is included; lost ack fails retirement. Late claim drains normally, while explicit close prevents late tool dispatch. |
| Snapshot and capacity | Foreign scope and later submissions are excluded; shared capacity blocks claims until released. Other owners retain their live jobs. Missing/unknown/oversized evidence fails retirement. |
| Terminal/heartbeat races | Rejected or silently omitted terminal writes fail drain; an outstanding renewal delays successful drain. A synchronous renewal fault cooperatively aborts execution. |
| Explicit abort | `close()` aborts active jobs and waits cleanup. It can escalate pending drain; that drain rejects. Repeated hooks are idempotent. |
| Singleton on both sides | Real Studio worker completes both cases and durable result while consumer still accepts; then consumer drains, both owners are replaced, queued evaluation completes with exactly one call per case. |
| Shared-store consumer overlap | Two PostgreSQL store handles share namespace/generation. Routing switches to the compatible replacement; old active execution finishes; Studio commits; old pool closes. New replica reads old results and deduplicates the original POST without another tool call. |
| Wrong singleton order | Retire consumer after first accepted case; Studio's later case cannot be admitted, exhausts bounded retry/deadline and persists Error. This intentionally negative proof prevents a whole-suite drain claim. |
| Contract mismatch | Real HTTP generation/suite revision changes return 409 before case execution. |
| Old extension contract | Custom store without queued/claimQueued still executes normally, but graceful drain explicitly refuses success. |
| Old consumer wire compatibility | Current native Studio worker successfully runs a frozen pre-drain SDK consumer build. Legacy stream success/cancellation/non-acceptance also pass unit regressions. |

Local checks after these changes:

- Agent: **603 passed, 5 skipped; 100% statements/branches/functions/lines**, with
  the existing gate unchanged. This includes 24 consumer-retirement checks and
  24 existing execution-protocol checks. Agent type-check and build pass; the
  built `kortyx` facade exposes and successfully executes drain/close.
- Runtime: **58 passed; 100% statements/branches/functions/lines**, with the existing
  gate unchanged. Runtime type-check and build pass. Full PostgreSQL integration:
  **41 passed, 7 optional Redis-dependent checks skipped**. Coverage passes the
  existing PG gate: **96.28% statements, 90.78% branches, 97.38% functions, 97.19%
  lines**. This includes all five consumer execution-store tests.
- Final native Node **22.14.0**, PostgreSQL **17** local Docker rehearsal:
  **16 process scenarios**, **41 runtime PostgreSQL tests**, **10 + 8** persisted
  eval regressions, **1** real two-API invalidation and **1** execution-evidence
  recovery passed: **77 integration checks** total. The seven optional Redis cases
  were skipped. An earlier focused-store rehearsal passed 37 checks. No paid model
  calls; the scope-labelled PostgreSQL container and child processes were cleaned up.
- API: **3 profile checks + 165 tests passed**, type-check and production bundle
  pass. **51 opt-in/platform-dependent tests skipped** in the ordinary command;
  the selected database cases above ran separately. Root/Linux updater ownership
  was skipped in this macOS run; the later Docker checks above cover it.
- Website: **26 routing/frontmatter/link checks passed**. **99 relative file links**
  across relevant READMEs, repository/website guides and distributed skill resolve.
  Targeted lint passes with existing/new fixture non-null warnings; no gate reduced.
- API's direct runtime dev dependency is workspace-linked. Lockfile change is
  three added lines only; no dependency upgrades. Agent/runtime are already in
  release-please registration and existing exports; publish their compatible pair.

A repeat rehearsal exposed timing sensitivity in the original 500ms execution
budget for two real HTTP attempts under local build load. The fixture now grants
two seconds and explicitly waits longer than that while the job is queued; this
preserves the independent queue-wait assertion without changing product defaults.

The frozen baseline lives only in ignored
`packages/agent/node_modules/.cache/kortyx-retirement-baseline/dist/`. It was
built before editing the SDK and has no handler drain method. Its original
`route-executions.ts` SHA-256 is
`3db18ad79e74f167f16c97ecfc2da818bc0b6127f2ec2147d1cff6cad109e361`, matching
that file at `438dac5a`. It uses this workspace's dependencies and current eval
fixture; it is **not a published historical-release matrix**. The baseline case
skips when that ignored artifact is absent, including normal CI. The remaining
process/adapter regressions are wired into public preflight, untriggered.

Retirement does not itself wait for every HTTP observer. An initial overlap
rehearsal closed the old pool too early and correctly failed to produce the
Studio terminal outcome; the passing sequence retains it until Studio commits.
No guarantee is made for forced termination, unrelated application traffic,
arbitrary historical schemas, AWS rollout behavior or private Cloud integration.

## Careful OSS review follow-up

The review checked all changed production code and host/configuration paths,
including both retirement loops, SQL ownership/capacity, signal handling,
updater fencing, image entry/commands, queue snapshots, duplicate admission,
authentication, public adapter capabilities and rollout guidance. Six concrete
edge cases were corrected locally:

| Priority | Finding and correction | Evidence |
| --- | --- | --- |
| P1 | PostgreSQL `now()` is transaction-start time: a heartbeat blocked on a row lock could renew a lease after it expired. Lease creation/fences and completion timestamps now use `clock_timestamp()`, including claim-lock delays. | The old heartbeat implementation failed a real row-lock reproduction. All three heartbeat/progress/finish lock-expiry regressions now pass against disposable PG. |
| P1 | A jobs-v1 POST whose response was lost could retry during drain and receive `accepted: false` for an execution that was already running. Matching known identities now reattach without new admission or replay; changed content stays 409 and new IDs stay refused. | Unit test failed before the fix. A native Studio worker now recovers a deliberately destroyed POST response while the consumer drains; one selected case executes exactly once and Studio persists Passed. |
| P1 | Studio discarded an ambiguous claim failure that occurred before drain began, then acknowledged retirement after later healthy polls. Claim uncertainty now remains latched across polling recovery. | Before-preparation regression resolved incorrectly before the fix; now rejects retirement with a bounded message. |
| P2 | A synchronous custom execution-store claim throw could clear `ticking` before its promise was assigned, leaving the consumer pump permanently busy. The pump now installs its promise before invoking adapters. | Regression stalled accepted work before the fix. It now completes work while retaining the earlier ambiguous-claim retirement failure. |
| P2 | Explicit worker stop could abort execution while a pending drain still resolved successfully. A pending drain now rejects on stop, while an already confirmed drain remains cached and repeatable. | Abort escalation, late claim after abort, drain-before-start and lifecycle race regressions pass. |
| P2 | HTTP/resource cleanup rejections with `undefined` were mistaken for success by truthiness checks. Error presence is tracked independently of the thrown value, while remaining dependencies still close. | Targeted lifecycle and shutdown regressions pass, including a rejected resource followed by a successfully closed database. |

Changed source: `packages/agent/src/evals/route-executions.ts`,
`apps/api/src/evals/worker.ts`, `apps/api/src/lifecycle.ts`,
`apps/api/src/shutdown.ts` and `packages/telemetry-db/src/repositories/evals.ts`.
Regressions are in the existing consumer/worker/lifecycle/shutdown tests and the
expanded `eval-retirement.integration.test.ts`.

Final local review checks:

- Agent coverage: **603 passed, 5 skipped, 100%** for all four measures. No gate
  changed. Agent build/type-check and telemetry-db build/type-check pass.
- API tests/type-check: **3 profile checks + 165 tests passed**, **51 skipped**
  without opt-in/platform environments. API production bundle builds.
- Native Node 22 + PG 17 rehearsal: **16 process scenarios + 41 runtime PostgreSQL
  cases + 10 + 8 persisted eval cases + 1 HA + 1 receipt recovery = 77 passed**;
  7 optional Redis cases skipped. PostgreSQL coverage retains its existing gate.
- Worker/lifecycle abort and falsy-resource corrections also pass targeted tests.
  Runtime unit code did not change in this review; its prior 58-test / 100% result
  is retained, not presented as a fresh execution of that suite.
- Website routing/frontmatter audit: **26 passed**; updated relative links resolve.
  Targeted lint has fixture non-null warnings; no quality gate was reduced.

The original frozen-consumer compatibility case still runs in the native proof
locally. It skips when the ignored baseline artifact is absent, so public CI alone
would not establish a historical SDK matrix. Current legacy wire behavior and
old/custom store capability handling have committed executable regressions.
No new wire fields or database migrations were introduced by this review.

Remaining release boundaries are explicit: the later local Docker proof above
verifies the selected published API/SDK baseline and candidate images. Final-head
public CI, the actual platform's signals/lifetime and future published release
versions still need verification. Older workers cannot
participate in the new database-wide budget guarantee without an admission fence.
Agent/runtime must be released together for built-in consumer drain support;
custom adapters must implement atomic scoped snapshots/selected claims. Removing
target configuration is not worker retirement and must not bypass preparation.

This review did not inspect or test the private Cloud adapter or change servers.
No additional in-scope OSS defect is known from these checks; that is not a claim
of exhaustive race freedom, historical-version coverage, forced-kill recovery or
an availability SLA. Cloud should integrate the reviewed OSS contract and verify
its own restricted adapters and rollout controller before enabling deployment.
No production changes, pushes or CI runs occurred.

## Completion assessment

This assessment covers the final public diff prepared for review, including the
small Next.js route-prop compatibility fixes. Local results do not satisfy the
final-head CI requirement. Resolve Pending rows in the PR before merge.

| Area | Status | Evidence or explanation |
| --- | --- | --- |
| Behavior and contracts | Complete | Signal semantics, singleton/overlap, SQL ownership, updater refusal, consumer drain races and failure outcomes verified locally. |
| Studio integration | Pending | Real authenticated submission/read/cancel, persisted outcomes and live invalidations pass locally. Two page-entry prop fixes preserve Next.js compatibility without changing presentation; the settings rendering test passes. Final public Studio browser/build checks remain pending; no new local OSS browser walkthrough is claimed. |
| Documentation and examples | Complete | Retirement/resilience guides, agent/runtime READMEs, website SDK/Studio docs, three Compose templates and env example updated; link/config checks pass. |
| Kortyx skill | Complete | Distributed conversation/Studio eval references cover both lifecycles, required adapter capabilities, ordering and compatibility; reference checks pass. |
| Usage telemetry | Complete | Reuses existing evaluation terminal accounting and opt-out; no new maintainer operation or customer content added. Existing usage regressions pass in API tests. Process state logs are separate operational diagnostics. |
| Customer observability | Complete | Existing persisted progress/result/cancellation and uncertain failure semantics retained. Bounded worker health state and generic retirement failure diagnostics; no new customer trace schema or OTel changes. |
| Compatibility and extension points | Complete | Additive handler drain and optional queue-store methods; both built-in stores tested. Legacy streams and a frozen pre-change workspace consumer work with current Studio. Exact published 0.22.0 API / 0.32.0 SDK / 0.39.0 agent / 0.25.0 runtime boundary is verified above. No broad historical-release, private adapter or unrelated schema matrix claimed. |
| Security and privacy | Complete | Worker exposes health only, refuses Cloud profile by code guard, needs no API-key pepper, retains configured target validation. Proof uses fake keys, disabled usage collection and isolated PG. Existing auth tests pass; private adapter is not covered by this slice. |
| Verification | Pending | Applicable local checks pass as recorded. Required final-head public CI remains pending at PR preparation. |
| Release and operations | Pending | Real API Dockerfile builds and local ARM64/AMD64 signal/grace/ownership tests pass; exact published baseline verified above. Public preflight is wired; its final-head result is pending at PR preparation. Final-head CI/attestations and new release versions remain release gates. Legacy-owner fence, platform lifetime and orchestration remain documented operator prerequisites. No new package or migration. |

## Safe release boundary and remaining work

### OSS-first scope before Cloud integration

Keep two supported host modes: the embedded worker for simple installations with
an explicit maintenance pause, and web-only APIs with independently retired
workers. Shared lifecycle semantics, health, atomic admission limits, lease
fencing and durable outcomes belong in OSS. Cloud and self-hosted deployment
tools orchestrate those capabilities without private changes to their meaning.

The consumer endpoint now has a non-aborting `drain()` alongside explicit
aborting `close()`. Accepted execution retirement and the supported singleton/
shared-store ordering are implemented and tested locally. A consumer drain is not
a fence around a whole Studio evaluation: later cases are separate submissions.
A singleton must remain admitting until Studio worker drain and durable outcomes
finish. Overlap requires a compatible reachable replacement and shared durable
storage. Both paths retain observation dependencies until Studio saves results.
The hook does not install host signal handlers or a deployment controller.

Public release review must also settle mixed-version/schema overlap, final-head
CI/image checks and clear operator procedures. Asset/session continuity and host
shutdown deadlines remain explicit deployment prerequisites. Cloud rollout stays
the second step, after the shared contract is reviewed and normally integrated.

The website now has a dedicated
[deployment lifecycle guide](../../apps/website/src/docs/self-hosting/v0/deployment-lifecycle.md),
linked from overview, server/AWS deployment, operations, HA and configuration.
It distinguishes worker/consumer capabilities from host orchestration,
simple singleton maintenance from compatible overlap, and SLOs from SLAs. The
website HA page no longer equates the HTTP drain deadline with eval retirement.
Website documentation verification: 26 existing routing/frontmatter checks pass,
including the authored Markdown route/link audit. The sidebar count includes the
fifteenth Studio page. The follow-up checked 99 relative file links across SDK,
Studio and distributed guidance. No website image was built or published.

### Release limits

This slice provides an OSS host lifecycle and tests, not a deployment controller
or an availability SLA. Before release, review the SIGTERM/default-budget changes,
run final-head CI, and verify the actual platform's signal routing, shutdown
deadline and rollout policy. Local Linux API images and the exact 0.22.0 API/SDK boundary are now verified above.
Actual AWS/Coolify rollout, Studio browser compatibility, load benchmarks and outage
SLAs are not verified by these fixtures. Private Cloud orchestration and its previous native browser
proof remain separate work.

The consumer endpoint's `close()` still aborts local executions. Its new drain
requires the documented host ordering and dependency lifetime. Shared worker/
consumer draining cannot preserve a killed consumer host or guarantee exactly-once
tool side effects. Queue fairness/quotas, queue-age guarantees, host/database
failover and a single-process application restart with uninterrupted HTTP are
not introduced here.

Other affected surfaces and SLI/SLO/SLA distinctions are recorded in
[high availability](../studio/high-availability.md#other-surfaces-affected-by-deployments).
An internal reliability target must distinguish correct evaluation assertion
failures from infrastructure interruptions, and define queue-delay measurement
separately from availability. No customer commitment or uptime percentage was
created by this change.
