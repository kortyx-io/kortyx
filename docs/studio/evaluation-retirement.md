# Replace evaluation workers safely

This contract distinguishes accepting a submission into PostgreSQL from a worker
claiming it for execution. Draining stops **new claims**. Already-claimed groups
finish every remaining case, grading, cleanup and durable result write. An
in-flight claim and outstanding lease heartbeats also finish before retirement.
User cancellation and the evaluation's frozen execution deadline still apply.

A drained worker cannot resume claiming. There is no fixed worker drain timeout,
automatic transfer to another worker, or promise to replay customer side effects.
An ambiguous claim or unconfirmed completion fails retirement, including a claim
acknowledgement lost before preparation began. Later healthy polls do not erase
that uncertainty. Explicit `stop()` during a pending drain rejects that drain; a
previously confirmed drain stays confirmed.

## Select the topology

| Topology | Deployment behavior |
| --- | --- |
| Strictly one worker process | Drain and exit the old owner before starting its replacement. New submissions wait in PostgreSQL while the API is available. A failed replacement extends that wait. |
| One worker normally, temporary overlap allowed | Start and verify a compatible replacement before draining the old owner. Both count against the shared execution limit. |
| API with an embedded worker | Prepare evaluation draining while HTTP remains available, then retire the API. A single API still has an HTTP interruption when replaced. |
| Web-only APIs and separate worker processes | Web traffic and worker replacement can be scheduled independently. Recommended when long suites must survive web releases. |

The default API retains an embedded worker. Set
`KORTYX_API_EVAL_WORKER_ENABLED=false` on **every web-only API replica** to avoid
accidentally running additional embedded workers. Keep target discovery and judge
configuration on the API: disabling execution does not disable submission or
change the API's permissions.

Run a separate worker from the same API image, overriding its command with:

```text
node apps/api/dist/eval-worker.js
```

It needs `DATABASE_URL`, the same private target definitions and applicable judge
configuration as the API. It does not need the API-key pepper or Studio read key.
`API_HOST` and `API_PORT` configure its health listener (default `0.0.0.0:6400`);
use separate ports when processes share a network namespace. The explicit worker
command runs a worker regardless of the API-only enable flag. It refuses empty
targets and non-self-hosted deployment profiles. It does not run migrations.

Its listener serves only `GET /live`, `/health` and `/ready`. Keep it private.
Liveness remains successful during draining; readiness is `503` once admission
is draining or drained, or PostgreSQL is unavailable. Health JSON includes a
bounded process state, with no tenant IDs, target URLs, credentials or job data.
Do not use readiness failure to kill a draining worker. API readiness describes
HTTP service availability, not available evaluation execution capacity.

## Upgrade from older releases

The published Studio/API **0.22.0** image does not provide `SIGUSR2` preparation
or the standalone worker entry point. Do not use `SIGUSR2` as a preparation fence
for that image: an unsupported signal can be ignored by Linux PID 1 or terminate
a differently hosted process. Its `SIGTERM` stops the worker
without waiting for the whole evaluation to finish. The published `kortyx` 0.32.0 /
agent 0.39.0 / runtime 0.25.0 pair also lacks the new consumer `drain()` hook.
Use a release explicitly containing these capabilities; a newer configuration
file does not add them to older binaries.
Image updates also preserve an installation's saved Compose file. Verify the
actual service `stop_grace_period`/container stop timeout; setting
`KORTYX_API_STOP_GRACE_PERIOD` only affects templates that reference it. The local
45-second test is an example proving signal/grace behavior, not a universal
production timeout for evaluations that may take much longer.

For the first upgrade from an older embedded worker, establish a verified fence
against new evaluation submissions, explicitly settle queued work, and wait for
all active evaluations and durable results while the old services remain alive.
Then retire the old processes during controlled maintenance. An idle snapshot
without a submission fence is insufficient. Do not start overlapping old/new
workers and assume the older owner honors the new shared execution budget.

## Signals and dependency lifetime

| Signal | Behavior |
| --- | --- |
| `SIGUSR2` | Prepare evaluation retirement. Stop claims and finish claimed work; leave HTTP, cancellation and dependencies available. A bounded state log reports `draining`, then `drained`, or `failed`. |
| `SIGTERM` | Retire the process. Withdraw API readiness, drain HTTP for up to 25 seconds, independently finish evaluations, then close dependencies and flush optional maintainer usage delivery. Repeated signals do not escalate into abort. |
| `SIGINT` | Explicitly abort worker execution and retire HTTP/resources. This can leave execution status uncertain; it is not successful evaluation draining. |

Use these signals with the built Node entry point on a Unix host. Development
watchers and third-party process managers may assign other meanings to signals;
verify delivery to the actual owning process. Windows hosting needs an equivalent
application-owned lifecycle integration.

For a singleton embedded API, send `SIGUSR2` to the verified owner and wait for its
current `drained` confirmation before withdrawing its HTTP route or terminating
it. Submissions, progress, prompt reads and cancellation remain available during
this preparation. Queued work remains queued until an eligible replacement starts.
Do not let a healthy-but-drained owner sit indefinitely as the only worker.

Direct `SIGTERM` also drains evaluations, but the API's HTTP listener retires
immediately. Cancellation/results must then use a surviving API replica. Sending
`SIGTERM` to the only combined API/worker can make HTTP unavailable for the rest
of a long suite. Separating workers avoids this coupling.

Container platforms can still force-kill a process after their shutdown deadline.
The built-in updater refuses configured evaluation targets before pulling,
stopping services or migrating and pauses automatic updates. This includes a
configured target file even when currently empty, and web-only APIs with targets
whose workers may be elsewhere. Use controlled manual maintenance with verified
worker retirement instead. A momentarily empty queue is not a safe update fence.
Removing target configuration does not retire an existing owner or cancel persisted
queued work. Do not remove targets to bypass this guard; first fence and retire
all relevant owners and settle queued runs explicitly.
Older updater binaries lack this guard: disable their automatic schedule before
configuring evaluations. CLI `stop`/`reset` and direct Compose commands are also
operator shutdown actions; they do not orchestrate preparation automatically.

The supplied Compose templates allow 30 seconds for HTTP retirement, **not long
evaluation retirement**. Prepare active evaluations before Compose teardown, or
configure and verify a platform grace period covering all frozen run deadlines
and cleanup. No universal cleanup bound has been established. Increasing a stop
timeout alone is not a retirement controller. If an operator/controller wait
expires, retain the owning process, report incomplete deployment, and block
additional worker generations; do not turn the wait timeout into a forced abort.

## Capacity, queued work and compatibility

`KORTYX_EVAL_MAX_CONCURRENT_EVALUATIONS` is a positive integer, default `4`.
The OSS worker passes this limit into the serialized PostgreSQL claim transaction:
it counts distinct running evaluation groups and legacy standalone runs across
the database, including draining owners. Each process also limits its own active
groups. Set the **same value on all workers**. A group can contain multiple suites
and many parallel attempts; this is not a provider-request or tenant spending cap.
Consumer endpoint execution limits and provider quotas still apply independently.

This changes the previous per-process-only default: adding workers no longer
automatically multiplies the OSS execution budget. Older worker binaries, custom
stores and direct claim callers that omit a shared limit do not enforce this
contract. Quiesce legacy owners through a verified admission fence before relying
on the new bound; observing an idle process is not a fence. Custom stores must
provide their own atomic ownership and shared admission rules. No Cloud-specific
store or deployment capability is implied by this OSS host.

Queued evaluations keep their IDs and persisted status across replacement.
Cancelling a queued evaluation prevents it from executing. Queue waiting does
not consume the worker's execution deadline, and a CLI wait timeout does not
cancel a run. OSS does not add a queue-age guarantee or a new database queue quota
here; operators must monitor backlog/oldest age and enforce appropriate admission
limits. A caller should not resubmit merely because it stopped waiting. Use the
same idempotency key on the grouped submission endpoint when retrying acceptance.

Old and new workers/web readers must support the same database, progress, result,
target and judge contracts. Follow the release's `rolling`/`recreate` marker and
migration order. If a replacement fails before preparation, keep the existing
worker admitting jobs. If it fails after preparation, the old owner still finishes
its work but cannot resume claiming: repair/start an eligible compatible owner.
Do not restart a draining owner with active leases. Rollback must preserve active
owners and their dependencies. Serialize deployments while earlier owners drain.

## Crash and consumer boundaries

Graceful retirement does not rescue a killed worker or failed host. After lease
expiry, the next claim pass records an uncertain/error outcome instead of
replaying application tools. The consumer may still be executing. Results and
partial evidence must not be presented as a completed successful evaluation.
Do not infer immediate stale-job reconciliation when no eligible worker is polling.

The consumer app's own deployment is a separate boundary. Its SDK endpoint has
its own execution store, capacity and host lifetime. The route handler now exposes
`await handleEvals.drain()` to stop new execution admission without aborting its local
active jobs. It finishes those jobs and a bounded scoped snapshot of accepted
queued jobs, including in-flight admissions/claims, cleanup, terminal writes and
pending heartbeats. Authenticated discovery, observation and cancellation remain
available. Matching jobs-v1 POST retries for known identities reattach existing
evidence during drain; changed content returns 409 and new IDs are refused. `close()` retains explicit abort behavior. Drain is idempotent,
irreversible, has no deployment timeout and rejects ambiguous ownership or
completion rather than acknowledging safe retirement.

A consumer job is not a whole Studio evaluation: later cases may not have been
submitted yet. For a singleton consumer, first prepare and finish Studio worker
draining **while that consumer remains accepting**, wait for durable Studio
outcomes, then drain the consumer. Keep its HTTP listener and execution store
alive until observers have consumed results; consumer drain does not await every
HTTP reader. Then retire HTTP, close the handler and close its store. Draining the
only consumer first can cause later cases to exhaust admission retries and Error.

For overlapping consumers, first make a compatible replacement reachable with the
same durable execution namespace, service key, suite revisions and limits. Route
new admissions there and drain the old handler. Preserve observation until Studio
commits outcomes before closing old resources. The old owner claims only its
fixed queued snapshot, not new jobs submitted later by a replacement. Other
owners' live jobs stay their responsibility. Shared PostgreSQL preserves queued
jobs/results; it cannot move running code or make separate memory stores shared.

Upgrade agent and runtime together. Built-in memory/PostgreSQL stores implement
optional `queued` and `claimQueued` capabilities; older custom stores retain normal
execution but graceful drain refuses success without both. The latter must honor
scoped selected IDs, atomic ownership and shared caps. The jobs-v1 and legacy wire
formats and stored schema are unchanged. See
[execution resilience](../evals/execution-resilience.md#graceful-consumer-retirement)
for admission responses, failure handling and the complete adapter contract.
Studio draining cannot preserve a killed consumer or arbitrary application HTTP
requests, chat streams and tools outside this eval endpoint.

See [high availability](./high-availability.md) for other affected surfaces and
[the local verification record](../internal/studio-retirement-verification.md)
for exact coverage and remaining release checks.
