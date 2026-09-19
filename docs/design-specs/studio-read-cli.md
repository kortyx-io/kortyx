# Read-only Studio CLI

## Reference research

Reviewed primary documentation/source on 2026-09-19:

- [Sentry CLI commands](https://cli.sentry.dev/commands/) and
  [trace commands](https://cli.sentry.dev/commands/trace/): bounded filtered
  lists, separate detail inspection, JSON output, pagination, and trace context.
- [Community Langfuse CLI](https://github.com/aviadshiber/langfuse-cli): named
  configuration profiles, environment overrides, system-keyring secrets, and
  JSON output. This is an independent community CLI, not an official Langfuse
  product.

We reuse Commander, native fetch, and the existing Zod telemetry contracts.
The CLI remains a thin HTTP adapter rather than a second Studio query engine.

## Implemented surface

```text
kortyx connections add/list/use/remove
kortyx studio inspect <run/session/interrupt-url>
kortyx studio runs list/get
kortyx studio sessions list/get
kortyx studio interrupts list/get
kortyx studio workflows list
kortyx studio catalogs
kortyx studio doctor
```

These commands are separate from the existing lifecycle and topology-publish
commands. Data access calls only allowlisted `/v1/studio/*` GET endpoints.
They have no database imports, arbitrary API escape hatch, execution/resume,
interrupt approval, or remote administration capability. The API's normal key
last-used bookkeeping still occurs during authentication.

## Connections and authentication

The API authenticates a bearer key with `studio:read`, deriving organization
and project from the key rather than a client-supplied project flag. A project
switch is therefore a profile/key switch. Browser Basic Auth and telemetry
write keys are not CLI read credentials.

The reserved local connection reads the current managed local URL/credential
state, preserving rotation behavior without copying secrets. Remote profiles
contain an API base URL, optional Studio browser base URL, environment-variable
credential reference, optional list environment default, and verified
organization/project display labels. Credentials are injected externally, not
persisted in the profile. Saved identity labels are informational; inspection
and doctor expose the live API-authorized context.

Environment references provide a cross-platform, dependency-free first
credential backend. Unlike the Langfuse reference, this release does not add
OS-keyring storage or interactive account login. A future credential provider
can add those without changing the HTTP client or command handlers. Remote
keys must be provisioned by an operator using the existing deployment model;
no Admin API exists for account/project/key discovery yet.

IDs select by explicit flag, `KORTYX_CONNECTION`, saved default, then local.
URLs select by an explicitly matching flag/environment selection, or a unique
configured API/Studio locator. Saved defaults cannot resolve URL ambiguity.
Multiple project profiles sharing a locator require explicit selection.
Origin and reverse-proxy base-path boundaries must match. A URL is a locator
plus entity ID, not permission to send a credential to that host.

Direct API overrides require an explicit API URL and key environment reference,
without an existing connection selection; they accept IDs only. Connection
URLs reject embedded credentials/query/fragment, require HTTPS except loopback,
and never follow redirects. Reads time out after 15 seconds and cap response
bodies at 20 MiB.

## Debugging contract

JSON data output is versioned (`schemaVersion: 1`). Human output is indented
JSON without terminal UI. API/connection errors have structured JSON on stderr
in JSON mode; Commander argument errors retain its stderr diagnostics. Exit
status is 0 for success/help and 1 for failures.

Inspection validates each entity's existing contract and returns live project
context, detail, a latest-event window, branch-aware logical call summaries,
diagnostic evidence, and explicit windowing/capture caveats. Logical calls use
the shared projector, maintaining `(runId, branchId, invocationId)` identity and
restored/reused result semantics. Call event IDs are references rather than
duplicated full events. Navigation selectors are retained but not applied as
API query filters. Unknown URL query parameters are discarded.

Diagnostic findings are not root-cause verdicts. Failures and contextual
interrupt/retry/denial/cancellation/limit events must be compared with the
final execution outcome. Evidence generation examines all returned events,
even if the visible timeline is windowed; finding/call omission counts are
reported separately. Missing events cannot prove absence of execution.

Content fields are omitted by default; `--include-content` explicitly opts
into already captured data. Resume tokens and recognizable sensitive fields,
Kortyx keys, and bearer credentials remain redacted. This is best-effort
redaction, not arbitrary-content DLP. Error messages/content remain sensitive,
untrusted evidence. Capture policy remains producer-owned.

Lists expose offset pagination, default 25 items/24 hours, with explicit
`nextCursor`, short preset aliases, and custom ISO boundaries. Workflow metrics
currently cannot filter environments; the CLI rejects an explicit unsupported
environment filter and states that profile defaults do not apply.

## Verification

Tests cover HTTP-only GET access, key errors, malformed/version-mismatched
responses, response limits, redirect rejection, URL mapping/ambiguity/base
paths, secret-free profile persistence, local rotation, run/session/interrupt
inspection, content redaction, call branch identity, paging/filter translation,
and real loopback HTTP requests. Existing lifecycle/topology tests remain in
place. No remote deployment or data mutation is required for verification.
