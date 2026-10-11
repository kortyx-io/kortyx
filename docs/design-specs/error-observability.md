# Kortyx error observability research and scope

Status: research and staged product scope, 8 October 2026. The first diagnostic-preservation release is implemented in this branch; see [deployment and usage](../complete-error-diagnostics.md). Later error-management releases remain proposals.

Kortyx should build a dependable error capture and investigation foundation now, with contracts that support an error-management feature later. The consumer report identifies a real capture gap, but preserving larger strings alone does not create an error logging tool. The complete product needs trustworthy diagnostics, reliable delivery, recurring-error grouping, investigation, triage, and operational controls.

The proposed foundation separates the safe public failure, an individual error occurrence, its private diagnostic, and the issue grouping recurring occurrences. Retain existing public failure safety. Make diagnostic completeness and delivery status explicit. Reuse Studio's workflow and trace context, while allowing errors that have no active workflow or span.

## How Sentry records errors

### Capture and context

Sentry captures exceptions explicitly and through integrations. Its exception format records type, message, stack frames, and the capture mechanism, including whether an exception was handled. Causes form a chain; exception groups such as JavaScript AggregateError form a tree represented by exception IDs, parent IDs, and source properties such as `cause` or `errors[0]`. [Sentry error specification](https://develop.sentry.dev/sdk/telemetry/errors/)

Scopes add context at capture time. In Node.js, request isolation separates concurrent requests, while narrower scopes add information for a specific operation. Context and breadcrumbs belong to that execution context rather than a shared mutable global record. [Node.js scopes](https://docs.sentry.io/platforms/javascript/guides/node/enriching-events/scopes/)

Custom error properties use a separate enrichment integration. ExtraErrorData extracts non-native attributes, optionally invokes `toJSON`, and has its own serialization depth. This is additional diagnostic data rather than part of the basic exception interface. [ExtraErrorData](https://docs.sentry.io/platforms/javascript/configuration/integrations/extraerrordata/)

**Implication for Kortyx:** preserve structured exception relationships and capture origin. Keep application context isolated across runs and branches. Provide native diagnostic enrichment, with an explicit adapter for unusual objects. Kortyx's default serializer should continue avoiding arbitrary getters and `toJSON` calls because those execute application code.

### Processing and transport

Sentry enriches events before sending; `beforeSend` can modify an event or suppress it. Its error sampling is separate from tracing sampling. The JavaScript configuration documents normalization depth of 3, object/array breadth of 1,000, and configurable string truncation. The LinkedErrors integration defaults to a limit of 5. [JavaScript options](https://docs.sentry.io/platforms/javascript/configuration/options/), [LinkedErrors](https://docs.sentry.io/platforms/javascript/configuration/integrations/linkederrors/)

Sentry sends an envelope containing typed items. An error event and supporting attachments can be associated through the event ID. Its developer specification currently limits an event item to 1 MiB and an entire decompressed envelope to 200 MiB. The JavaScript attachment documentation separately specifies compressed-request and attachment limits, and describes rejection when those limits are exceeded. [Envelopes](https://develop.sentry.dev/sdk/envelopes/), [Attachments](https://docs.sentry.io/platforms/javascript/enriching-events/attachments/)

Attachments can be viewed with an event and downloaded under access controls; they have retention and quota rules. They are a supported path for larger evidence, but Sentry does not automatically convert every truncated error property into a complete diagnostic attachment. [Attachments](https://docs.sentry.io/platforms/javascript/enriching-events/attachments/)

**Implication for Kortyx:** borrow the separation of searchable event and larger evidence. Do not equate an SDK capture call, successful HTTP submission, or accepted summary with complete diagnostic retention. An automatic diagnostic sidecar would be a deliberate Kortyx capability, with its own integrity and delivery contract.

### Server ingestion and query storage

Sentry's Relay processing mode normalizes, filters, and rate-limits telemetry, then publishes it into Kafka. Snuba provides an analytical storage/query layer backed by ClickHouse, with consumers batching events and downstream processing coordinating with commit information. Its architecture explicitly distinguishes ingestion from query visibility and discusses eventual consistency. [Relay](https://github.com/getsentry/relay), [Snuba architecture](https://getsentry.github.io/snuba/architecture/overview.html)

**Implication for Kortyx:** separate ingestion acknowledgement, diagnostic availability, search projection, and notification processing. Start with PostgreSQL and explicit state transitions. If projections or alerts run asynchronously, use a transactional outbox with idempotent workers and monitor their lag. Introduce Kafka or an analytical database only after measured scale requires them; adopting Sentry's product concepts does not require its deployment footprint.

### Privacy and loss visibility

Sentry supports scrubbing before transmission and on the server. Attachments have separate scrubbing behavior with limitations; ordinary event scrubbing is insufficient to establish attachment privacy. [Sentry scrubbing guidance](https://www.sentry.help/en/articles/13964268-what-are-sentry-s-data-scrubbing-options), [Attachment scrubbing](https://docs.sentry.io/security-legal-pii/scrubbing/attachment-scrubbing/)

Client reports record discarded telemetry by category and reason, including filtering, sampling, queue overflow, and delivery problems. These are best-effort aggregate reports rather than an exact receipt for every lost event. The product's usage view distinguishes accepted, filtered, rate-limited, invalid, and client-discarded telemetry. [Client reports](https://develop.sentry.dev/sdk/client-reports/), [Usage statistics](https://docs.sentry.io/product/stats/)

**Implication for Kortyx:** redact both diagnostic data and its summary before transmission, then validate policy again before storage. Expose aggregate capture/delivery health and individual diagnostic state where a manifest was received. A server cannot identify an event that never reached it; process crashes and fully disconnected clients require a local spool or an honest delivery limitation.

### Grouping and investigation

Sentry distinguishes an event occurrence from an issue. Default grouping considers a custom fingerprint, stack trace, exception, then message. Grouping is versioned, and custom rules influence future events. It uses application frames and normalized information to reduce differences that do not represent new bugs. The current product also has AI-assisted grouping. [Issue grouping](https://docs.sentry.io/product/data-management-settings/event-grouping/)

Issue details combine occurrence counts, affected users, first/last seen, environment and release information with an individual event's stack, breadcrumbs, context, and attachments. Assignment and resolution belong to the issue. JavaScript source maps support readable original-source stacks. [Issue details](https://docs.sentry.io/product/issues/issue-details/), [JavaScript source maps](https://docs.sentry.io/platforms/javascript/sourcemaps/)

**Implication for Kortyx:** count distinct occurrences, preserve the evidence behind each, and make grouping explainable. A single error bubbling through model, node, child workflow, and root spans must not become four occurrences. Conversely, separate retry attempts must remain separately inspectable. Defer AI grouping until deterministic grouping has a measured baseline.

### Source snapshot

The JavaScript source snapshot examined was commit `3d01e5a9a39a4a81ac625f814d9a17e994a7bdd5` on Sentry's development branch, not a claim about every released SDK. It corroborates the documented limits and shows how AggregateError members and circular values are handled:

- [LinkedErrors defaults](https://github.com/getsentry/sentry-javascript/blob/3d01e5a9a39a4a81ac625f814d9a17e994a7bdd5/packages/core/src/integrations/linkederrors.ts)
- [Cause and aggregate traversal](https://github.com/getsentry/sentry-javascript/blob/3d01e5a9a39a4a81ac625f814d9a17e994a7bdd5/packages/core/src/utils/aggregate-errors.ts)
- [Normalization and circular markers](https://github.com/getsentry/sentry-javascript/blob/3d01e5a9a39a4a81ac625f814d9a17e994a7bdd5/packages/core/src/utils/normalize.ts)
- [Event preparation and normalization options](https://github.com/getsentry/sentry-javascript/blob/3d01e5a9a39a4a81ac625f814d9a17e994a7bdd5/packages/core/src/utils/prepareEvent.ts)
- [Custom property enrichment](https://github.com/getsentry/sentry-javascript/blob/3d01e5a9a39a4a81ac625f814d9a17e994a7bdd5/packages/core/src/integrations/extraerrordata.ts)

Sentry's SDK behavior varies by platform and version. Its normalization and transport ceilings demonstrate that it is a bounded observability pipeline, not a lossless archive of arbitrary live exception objects.

## Baseline before this implementation

The research baseline checkout was `923b910c8eb02ce213899ff75bc57bc6e03d3111`, declaring `kortyx@0.27.0`, `@kortyx/hooks@0.30.1`, and `@kortyx/telemetry@0.11.1`.

| Existing surface | Reusable foundation | Work still required |
| --- | --- | --- |
| [Safe failures](../../packages/core/src/errors.ts) | Public code/category/status contracts and bounded serialization | Retain private provider evidence before response bodies are consumed or discarded |
| [Exception diagnostics](../../packages/hooks/src/error-diagnostics.ts) | Trusted observer hook and projection/suppression | Replace silent string/depth loss; custom fields, aggregates, references, and omission records |
| [Native mapper](../../packages/telemetry/src/event-mapper.ts) | Event IDs and workflow/trace correlation | Carry a diagnostic reference and complete custom projection rather than selecting four fields |
| [Trace adapter](../../packages/telemetry/src/trace.ts) | Failed spans and handled error reporting | One occurrence across propagation; capture outside active spans; distinguish handling from final execution outcome |
| [Tool observations](../../packages/hooks/src/tool.ts) | Fault, denied, cancelled, and explicit error-result distinctions | Capture private diagnostics separately from bounded tool observations and model-facing feedback |
| [Delivery](../../packages/telemetry/src/delivery.ts) | Non-fatal queue, retry, batch splitting, aggregate loss counters | Byte budgets, diagnostic-level acknowledgements/state, resumable uploads, shutdown and persistent spool contracts |
| [Database](../../packages/telemetry-db/src/schema.ts) | Project-scoped telemetry and indexed run/session projections | Dedicated occurrences, diagnostics, issues, retention, and grouping projections |
| [API authorization](../../apps/api/src/authorization/contracts.ts) | Explicit project-scoped actions | Distinct sensitive-diagnostic read/download permissions and audit events |
| [OpenTelemetry](../../packages/otel/src/span-wrapper.ts) | Exception recording and trace IDs | Keep bounded OTel fields plus diagnostic references; exporter acceptance does not guarantee full diagnostic retention |
| [Studio and CLI](../../packages/cli/src/studio/read-output.ts) | Run investigation, JSON output, some output redaction | Standalone error investigation, private diagnostic retrieval, completeness presentation, grouping and triage |

The previous [error contract hardening scope](./error-contract-hardening.md) intentionally excluded arbitrary private exception persistence and product-wide error search. This proposal adds a separate private observability surface; it does not relax public HTTP/SSE, model feedback, or checkpoint safety.

## Proposed architecture

### Four separate records

| Record | Purpose | Key contents |
| --- | --- | --- |
| Public failure | Safe application/client contract | Existing FailureDescriptor; optional opaque reference only if its exposure policy permits |
| Error occurrence | One observed failure at a particular time | Occurrence ID, severity, capture origin, error classification, handling/recovery status, timestamp, release, environment, correlation, diagnostic reference |
| Diagnostic | Private retained evidence for that occurrence | Versioned exception graph, original available strings, custom fields, provider response evidence, capture policy, omissions, redactions, integrity and storage state |
| Error issue | Recurring problem for investigation and triage | Grouping fingerprint/version, first/last seen, distinct occurrence counts, affected runs/users, status, owner, release history |

Occurrence identity, diagnostic identity, issue identity, and exception-node identity serve different purposes. Do not overload the existing event ID or hash of a message to represent all four.

Project identity comes from authenticated ingestion, never from a trusted-looking diagnostic field. Run, node, session, workflow revision, invocation, branch, trace, and span are optional when no execution exists; retain them whenever available. The current telemetry schema requires run/workflow IDs, so standalone errors need an additive occurrence contract rather than invented placeholder runs.

Add provider/model, tool/operation, request ID, SDK/runtime version, and release/build identity when available. Link surrounding workflow events as breadcrumbs for retries, tool calls, handoffs, and cleanup; for errors outside a run, offer a bounded context-local breadcrumb buffer. Keep prompt/output content governed by its separate capture policy. The diagnostic should explain where an error arose without requiring full content tracing to be enabled.

### Capture completeness

“Complete” means all supported, available diagnostic data after the configured privacy policy, within a published resource budget. It does not mean reconstructing JavaScript prototypes, evaluating getters, recovering previously discarded bodies, or capturing arbitrary process memory.

Use a graph representation with stable references for causes, aggregates, and shared/circular custom objects. Preserve member order and unrelated siblings. Handle non-Error thrown values and non-JSON types through documented tagged representations. A property read failure should mark that property rather than suppress the entire diagnostic. Default traversal must avoid application getters, serializers, and prototype pollution; unusual provider objects can use native adapters or a deliberate projection callback.

Publish separate limits for summary size, diagnostic bytes, object count, collection breadth, and capture effort. Keep a 60 KiB field and at least 16 cause levels in the standard acceptance fixture. Resource limits remain necessary; each omission identifies its path and reason, with original size/count when measurable. If size cannot be determined safely, report it as unknown. Privacy redactions are recorded separately without retaining the secret or its hash.

Capture and delivery need separate status fields:

- Capture: complete under policy, partial, suppressed, failed, or legacy unknown.
- Retention/delivery: pending, available, incomplete, rejected, expired, or deleted.

Reader authorization is separate from those states. A forbidden reader must not be told that a retained diagnostic is missing. Historical events must not acquire a fabricated “complete” status.

### Storage and delivery

Keep bounded summaries in normal telemetry/query projections. Store diagnostic bytes independently and fetch them on demand; avoid copying large bodies into every run response or issue list.

Store diagnostics in dedicated tables within Studio's existing PostgreSQL database, using its current project scope, migrations, and deployment. Keep these records separate from normal event payloads so large diagnostics can be retrieved on demand. Define a storage interface so S3-compatible object storage can be added when measured volume warrants it. Moving payloads to object storage adds lifecycle, backup, consistency, signed-download, and deployment work; 60 KiB alone does not establish that requirement.

Use a native upload protocol with a manifest, byte length, checksum of the redacted serialized content, schema/policy version, and upload identity. Inline small diagnostics or split larger ones internally. Define idempotent parts, bounded part sizes, duplicate/out-of-order handling, finalization, expiry of abandoned uploads, and integrity validation. Commit occurrence and expected diagnostic state so a received summary can show missing evidence. Mark availability only after successful finalization; do not expose partial bytes as a complete diagnostic.

Define server acknowledgement semantics and storage failure behavior explicitly. Acknowledgement of complete ingestion must follow durable database commit. Retries must preserve IDs. HTTP 413 should trigger supported transport sizing or an explicit rejection, never endless retries. Respect rate-limit hints, constrain compressed and uncompressed bytes, and keep telemetry failure isolated from workflow execution.

Offer a bounded persistent spool for Node/server deployments that need restart recovery. Serverless and browser transports need their own supported capability statements. Flush needs a deadline and a result that reports what was acknowledged or remains pending. Even a spool cannot guarantee capture before an abrupt process kill; do not promise exactly-once delivery. Monitor collector failures locally without recursively feeding them into the same failing collector.

### Privacy and compatibility

Redact structured credentials and credential-bearing strings in messages, stacks, URLs, headers, nested JSON, response bodies, and custom projections. Parse recognized structured body formats; use explicit policy for opaque text. Allow application-specific redactors and sensitive paths. A built-in scanner cannot guarantee discovery of every unknown secret or personal-data field.

Apply mandatory redaction after enrichment/projection and before buffering, logging, upload, checksum generation, or persistent spooling. Apply server policy before final storage as defense in depth. A redaction failure must withhold the affected private data and retain an explicit safe failure marker. Never persist raw pre-redaction bytes as a fallback.

Comprehensive custom/body capture should be an explicit rollout policy initially: existing tests intentionally exclude those fields, and provider responses can contain user content. The error-capture policy is independent of prompt/output tracing policy. Keep projection replacement and `null` suppression supported; make their effect visible where permitted. Publish changes to default capture behavior as a compatibility decision.

Diagnostic views/downloads require project access and a dedicated permission. Audit downloads/deletions, enforce retention and per-project limits, and test cross-project isolation. Keep private records out of public share links, HTTP/SSE failure responses, persisted public checkpoints, automatic model feedback, and general CLI summaries. Downloads should return structured redacted diagnostic bytes; any additional output masking must be disclosed rather than silently changing the artifact.

## Ordered delivery scope

### Release one preserves trustworthy diagnostic evidence

This release fixes the original consumer issue end to end and is the base for the later Errors feature. Completion requires all of the consumer's acceptance criteria, including native Studio and CLI retrieval, without consumer serializers or chunk reconstruction. The serializer work package alone does not complete that fix.

| Work package | Scope and deliverable |
| --- | --- |
| 1 Contracts and serializer | Versioned occurrence/diagnostic schemas, graph serialization, omissions/redactions, capture policies, public type exports, compatibility fixtures |
| 2 Capture at the source | Hooks/runtime/agent/tool/provider integration; preserve failed response bytes before consumption; JSON, text, malformed body and streaming failure handling; projection/suppression; standalone capture |
| 3 Privacy and correlation | Shared diagnostic privacy policy, execution isolation, complete correlation, distinct handling/recovery/terminal states, one occurrence across bubbling with linked span observations |
| 4 Ingestion and storage | Additive APIs/migrations, tenant-safe storage, manifests/parts/finalization, integrity and acknowledgements, abandoned-upload cleanup, retention and limits |
| 5 Delivery and operational visibility | Byte-aware transport, idempotent retry, deadline flush, persistent-spool capability, local delivery health and server-visible diagnostic state |
| 6 Investigation access | Run-linked and direct occurrence detail; exception/cause/aggregate explorer, private JSON view/download, completeness indicators; CLI get/download and machine-readable status |

The implemented first increment uses diagnostic manifests with occurrence IDs, graph capture, scoped object-identity reuse, native uploads, a Node spool, private PostgreSQL retention, and direct Studio/CLI retrieval. It does not yet model recovery outcomes or deduplicate newly wrapped exceptions across different invocations. Completely undelivered manifests are visible only through SDK counters/state; cloud authorization/RLS and scheduled cleanup require deployment integration. These limits and the migration/opt-in steps are documented in the [usage guide](../complete-error-diagnostics.md). The table above is the intended foundation scope, not a claim that later issue identity or every operational deployment gate has shipped.

Wire types should leave room for grouping metadata, release/build/source identifiers, capture mechanism, and occurrence outcome now. The issue engine and inbox can follow later. Do not make a diagnostic accessible only by first loading a complete run timeline.

### Release two adds a usable Errors product

| Work package | Scope and deliverable |
| --- | --- |
| 7 Grouping and search | Deterministic versioned fingerprints; application-frame normalization; provider code/category/operation context; explicit fingerprint overrides; indexed filters and paginated occurrences; grouping explanation |
| 8 Issue investigation and triage | Errors inbox, counts/trends/affected runs, first/latest/representative occurrence, open/resolved/ignored status, assignment, resolution history, regression policy; merge/split correction with audit history |
| 9 Release and stack understanding | Release/build metadata, raw and parsed frames, application/library distinction, source-map support and artifact identity for supported JavaScript builds, explicit unresolved mapping states |
| 10 Alerts and operations | New/regressed/rate-based error alerts, deduplication/cooldowns and retried notifications; transactional outbox for asynchronous work; SDK/storage/ingestion health, retention/deletion tools, backup/restore and upgrade guides |

Grouping must not use run IDs, timestamps, request IDs, secrets, raw response bodies, or deployment IDs as default identity inputs. Provider failures need stable codes and operation context so distinct HTTP 400 rejection categories are not merged solely because all pass through one wrapper. Keep the original diagnostic unchanged while normalizing derived grouping input. Version grouping behavior and make changes/reprocessing intentional.

Deduplication within one propagation path is separate from grouping across occurrences. Retries retain attempt identity, and concurrent branches retain independent occurrences. A handled report is not automatically an unhandled crash or a failed run. Control-flow interrupts, cancellation, waiting, approval denial, and execution limits remain explicitly classified and excluded from ordinary bug counts by default.

Counts and error rates need defined denominators and sampling semantics. Store affected-user identifiers only under privacy policy. Trace sampling must not silently drop captured errors. If error sampling is enabled, expose the policy and distinguish observed counts from estimates. Validate duplicate and out-of-order ingestion without double counting or incorrectly reopening resolved issues.

A usable first Errors release includes investigation, simple triage, and basic actionable alerts. Advanced workflow integrations can follow, but a searchable stream of oversized JSON alone is not that release.

### Later extensions

Defer browser crash/replay coverage, native crash dumps, arbitrary binary attachments, broad log aggregation, profiling, automatic remediation, AI grouping/root-cause claims, and a comprehensive external integration marketplace. Add Sentry export or another backend adapter after the native schema is stable; preserve native diagnostic references and document downstream limits rather than promising that another backend stores the entire artifact.

Node uncaught-exception/unhandled-rejection integrations can be added as an explicit option. Preserve the host application's termination policy and existing handlers. Kortyx must not install a default process handler that turns a fatal application error into continued execution.

## Release gates

| Area | Required evidence |
| --- | --- |
| Original consumer reproduction | A 60 KiB UTF-8 field, message and stack above current ceilings, 16-level cause chain, custom `status`/`responseBody`/`metadata.raw`, ordered aggregate members; exact retained non-redacted content through real API/database to Studio and CLI download |
| Cycles and unusual values | Self-reference, shared sibling object, cyclic cause, aggregate cycle, primitive throw, BigInt, Date, Map/Set and inaccessible property; unrelated content survives with documented representations |
| Provider source capture | All built-in providers, invoke and stream: JSON/text/malformed failed bodies, nested rejection details, request IDs, status, partial output then failure; diagnostic retention does not change public outcomes |
| Redaction and safety | Credential fixtures in keys, strings, URLs, headers, JSON/text bodies and custom projection; verify network body, local spool, server store, download, logs, HTTP/SSE, model feedback and public checkpoint boundaries |
| Delivery and integrity | Actual configured-size boundary, multibyte text, reordered/duplicate/missing parts, corrupted checksum, 413/429/5xx, timeout, queue pressure, storage failure, process restart and unavailable spool; explicit truthful state and no partial-as-complete output |
| Correlation and occurrence identity | Concurrent tenants/runs/branches, nested workflow propagation, cleanup failure, explicit handled error, retry recovery and terminal failure; correct context, no duplicate occurrence count, no data leakage |
| Permissions and retention | Cross-project attempts fail; unauthorized download cannot reveal bytes; expiry/deletion and abandoned uploads are visible and cleaned; database/object storage backups have documented policy |
| Studio and CLI | Real browser exception explorer/download, direct errors without runs, large payload loaded on demand, legacy unknown state; CLI bounded default, explicit diagnostic retrieval, machine-readable result and nonzero exit for failed/incomplete downloads |
| Errors product | Stable grouping across harmless message/path variation; distinct provider rejection codes; fingerprint explanation/override; deduplicated counts, merge/split, pagination, resolve/regress rules and alert cooldown/retry behavior |
| Performance and operations | Benchmark capture CPU/memory, queue bytes, ingestion/query/download latency and database growth against an agreed volume model; verify migration, restart, backup/restore and collector failure isolation |

The four existing telemetry projection tests passed during initial assessment. They cover automatic capture, replacement, suppression, and throwing projections; they do not prove the gates above. Implementation should extend existing suites and add real storage/browser/CLI coverage, rather than treating a serializer unit test as delivery evidence.

## Decisions to close before implementation

1. Expected errors/day, diagnostic size distribution, projects, retention, and query traffic. Use these to size storage and test budgets rather than copying Sentry's limits.
2. Supported first runtimes and guarantees: Node initially, with precise serverless/browser and process-crash limitations.
3. Comprehensive capture opt-in/default policy and migration path; separate credentials from application content/PII policy.
4. Published capture and transport budgets, PostgreSQL storage thresholds, and when to offer object storage.
5. Diagnostic permissions, audit expectations, deletion/backup policy, and self-hosted configuration.
6. Fingerprint/release/attempt semantics and what constitutes a regression or alert-worthy error.

Use the Workfully HTTP 400 fixture as one end-to-end pilot. A successful pilot reveals the exact provider rejection, exposes the redacted full artifact, links the originating node and attempt, and reports any lost evidence without application-specific serialization or chunk reconstruction.

This is a multi-release, cross-package feature. The six foundation packages should be reviewable separately but share one schema and release plan. Size the implementation after a short contract/storage prototype and benchmarks; neither the existing string truncation fix nor a calendar estimate based only on it represents the full scope.
