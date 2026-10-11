# Complete native error diagnostics

This first error-observability release preserves private evidence independently of bounded public failures and event summaries. The existing Studio PostgreSQL database stores diagnostic manifests, temporary upload parts, finalized JSON, and access audits. An error event carries a diagnostic reference; upload parts are not events and do not add rows to the run timeline.

## Enable capture and access

Deploy API and Studio with migration `0008_error_diagnostics` before enabling SDK capture. Use the normal telemetry database migration command (`pnpm db:migrate` for repository development). Existing SDKs and public failure responses remain compatible.

Private diagnostic retrieval requires both `studio:read` and the new `diagnostics:read` action. A telemetry write key cannot retrieve diagnostics. In self-hosted installations, set `KORTYX_STUDIO_ENABLE_DIAGNOSTICS=1` for the bootstrap job and rerun bootstrap; this adds the permission to the configured Studio key. Setting it back to zero on a subsequent bootstrap removes that optional grant. Configure retention and storage budgets on the API server, not just Studio. CLI-generated Compose forwards the bootstrap flag; supply API budget overrides explicitly when changing the defaults.

Cloud editions must grant `diagnostics:read` in their authorization adapter, authorize the diagnostic page and download proxy, mount the project-scoped route, and add tenant RLS policies for `error_diagnostics`, `error_diagnostic_parts`, and `diagnostic_access`. The OSS migration does not install deployment-specific cloud policies. The shared scoped-link helper includes diagnostics, and API queries always carry organization, project, and environment scope.

Opt in on the native adapter:

```ts
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";

const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_API_URL!,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
  environment: "staging",
  service: { name: "agents-api" },
  diagnostics: {
    enabled: true,
    // Optional Node-only recovery of redacted uploads after a restart.
    spoolDirectory: "/var/lib/agents/diagnostic-spool",
  },
});
```

The adapter captures original failed-span, reported-error, and tool exceptions. `telemetry.trace.reportError(error)` returns a diagnostic ID when capture is enabled, including outside a workflow. An optional `error` projection can replace the diagnostic with a data object, return `null` to suppress it, or throw; projection failures produce an explicit failed-capture record. Every projected value still passes credential redaction and resource limits.

Provide the adapter to the agent using its existing `telemetry` option. Applications should retire their custom error-chunk events after validating native capture. Existing custom chunk events stay historical events; there is no migration or decoder for application-specific chunk protocols in this release.

## Capture and privacy

The serializer preserves available messages, stacks, causes, AggregateError members, and own custom fields, including nonenumerable provider response evidence. The provider HTTP failure reader retains status, response headers, and JSON or text body privately before constructing the safe failure. Public HTTP/SSE serialization and model-facing tool observations still use the safe bounded contract.

Shared and circular objects use JSON-pointer markers such as `{ "$ref": "#/data" }`. Dates, bigint, Maps, Sets, undefined, and nonfinite numbers use tagged representations. The serializer reads data descriptors, avoids application getters and `toJSON`, and records omitted accessors or unsupported values. Node's native lazy stack is formatted without invoking an application `Error.prepareStackTrace` callback. Evidence discarded by application code before capture cannot be recovered.

Credential-shaped fields and common credential text are redacted before queueing, spooling, hashing, or sending. The server applies the same mandatory policy before publishing finalized content and scrubs the manifest summary. Temporary upload parts contain the SDK-redacted bytes; the server cannot scrub an arbitrary fragment independently, so a client bypassing the SDK could put unredacted bytes in temporary staging storage until finalization or expiry. Restrict ingestion keys and DB access accordingly. The policy is a credential baseline, not a guarantee to recognize every custom secret or to remove personal data. Use a projection to remove additional sensitive context required by the deployment.

Full diagnostics have a separate capture status (`complete`, `partial`, `failed`) and delivery state (`pending`, `available`, `incomplete`, `expired`). Credential redaction does not itself mean incomplete capture. Omissions identify paths and reasons, plus original byte or item counts when available. Final integrity checks require ordered parts, the declared length, and a SHA-256 digest; server-redacted content has its own verified digest and length.

| Default resource limit | Value |
| --- | --- |
| Serialized diagnostic / provider body reader | 8 MiB each |
| Upload part | 64 KiB, at most 128 parts |
| Capture graph | 10,000 visited nodes, depth 128 |
| Object properties / collection members | 1,000 per object/collection |
| In-memory diagnostic queue | 16 MiB (`maxQueueBytes` can override) |
| Retained project diagnostic budget | 256 MiB (`KORTYX_DIAGNOSTIC_PROJECT_BYTES`) |
| Pending upload expiry | 24 hours |
| Completed diagnostic retention | 30 days (`KORTYX_DIAGNOSTIC_RETENTION_DAYS`, 1–365) |

Limits bound resource use rather than silently truncating the standard message/stack at the old summary limits. Extremely large graphs may still exceed the final serialized budget; that produces a partial diagnostic explicitly marked `serialized_byte_limit`. Ordinary event summaries stay bounded and exclude custom private fields.

## Delivery and lifecycle

Native uploads are idempotent by diagnostic ID. Retries resend the manifest and parts safely. The SDK reuses a diagnostic for the same exception object within a run/invocation/branch/attempt scope. New wrappers, distinct attempts, and separate invocations can produce separate diagnostics; this is not a full product occurrence-grouping system.

Transient network errors and server errors retain queued content for retry. HTTP 429 respects Retry-After with bounded backoff. Permanent HTTP rejection and queue overflow are reflected in SDK delivery state and dropped counters. SDK delivery states retain the latest 1,000 IDs; counters survive that eviction. Studio can only report a diagnostic whose manifest arrived. A completely rejected or never-transmitted manifest may be absent from Studio.

For a bounded shutdown wait:

```ts
const delivery = await telemetry.flushDiagnostics(5_000);
// Record or inspect delivery.timedOut, pending, pendingBytes, dropped, states.
```

`flushDiagnostics` does not abort an in-flight upload when its deadline expires. The existing `flush()` also flushes ordinary telemetry and has no shutdown deadline. Applications must arrange shutdown time or use an optional persistent spool. The spool creates a credential/environment-specific subdirectory and stores only redacted content with directory mode 0700 and file mode 0600. Recovery validates checksums, schema, and queue budgets. Capture is synchronous but spool writes are asynchronous; a crash before a write completes can still lose evidence. Spool failures are visible as `spool_failed` while in-memory delivery continues. Protect and size the volume; this release does not encrypt it or provide exactly-once delivery.

Reads and downloads audit a hash of the authenticated actor. Responses disable caching. Expired content and parts are removed lazily during scoped reads/writes; expired manifests remain for seven days to explain retention loss. Schedule the operator pruning command daily so inactive projects are also cleaned:

```sh
DATABASE_URL=... pnpm --filter @kortyx/telemetry-db db:prune-diagnostics
```

Run it with an operator DB role authorized across projects. It also removes access audits older than 90 days. Scheduling, encrypted infrastructure, backup retention, and cloud role policies belong to the deployment. The project byte budget measures declared active diagnostic bytes, not total PostgreSQL disk usage; allow overhead for temporary base64 parts, indexes, audits, and backups.

## Investigate and download

Open **View diagnostic** from a failure in the run Events or Trace drawer. The private page shows delivery and capture status, omissions, credential redactions, correlation, full exception data, and a download link when delivery is complete. JSON/Pretty views preserve the captured representation; a `$ref` is a graph reference rather than another error event.

The CLI uses its existing Studio connection or explicit API options:

```sh
kortyx studio diagnostics get <diagnostic-id> --environment staging --json
kortyx studio diagnostics get <diagnostic-id> --environment staging --include-content --json
kortyx studio diagnostics download <diagnostic-id> --environment staging --output diagnostic.json
```

Default `get` returns metadata, correlation, and completeness without the large data object. Download verifies availability, length, and digest, writes mode 0600, and refuses to overwrite a file. Its JSON file contains the versioned diagnostic content (`data` and `capture`); manifest and correlation are available through `get` and Studio. Consumers need no chunk reconstruction. Plain OpenTelemetry exports remain bounded; use the native adapter for this archive.

## Verification and later work

[The manual fixture](../test/diagnostics/README.md) exercises a real HTTP 400 provider, agent/node failure, public HTTP/SSE, native upload, PostgreSQL, Studio, and CLI. Unit and integration coverage also exercises custom projections, resource omissions, accessors, cancellation, retries, spool restart recovery, tenant/environment permissions, malformed uploads, integrity, and retention.

Later releases in the [research and product scope](./design-specs/error-observability.md) add deterministic recurring-error grouping, standalone error search, triage, alerting, readable source stacks, and operational health dashboards. This release supplies capture, authenticated retrieval, and explicit loss states as their foundation.
