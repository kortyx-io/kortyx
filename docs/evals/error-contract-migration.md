# Migrating eval error handling

This change extends the eval JSON contract with optional safe `failure` and
`diagnosticId` fields, case `verification`, and `phaseDurationsMs`. Existing
results remain readable. No SQL migration or backfill is required: eval records
already store these JSON payloads. Previously discarded errors cannot be recovered.

Deploy the matching API and Studio build **before** upgrading consumer SDKs and
CLI. Older API validators may reject the new optional fields. Upgrade `kortyx`,
`@kortyx/agent`, `@kortyx/hooks`, and `@kortyx/cli` together using the release that
contains this change; it is not present in the previously published versions.
Rollback the consumer first if reverting API/Studio.

Consumers no longer need to catch a declared-safe `DomainError` merely to retain
its code/message in eval results. Put only public facts in declared-safe details.
Unknown exception messages, stacks and provider responses remain private.
Configure the agent's native telemetry with `diagnostics: { enabled: true }` and
a writer key authorized for diagnostic ingestion. Use the same project and
environment as the Studio reader. Eval failures then link to the existing
protected diagnostic view, where users can inspect or download captured data.
Credential redaction, existing capture limits, retention and incomplete-delivery
states still apply. Application code must pass the original exception through;
metadata discarded before capture cannot be reconstructed. OTel alone does not
create a native diagnostic archive.

A custom agent may supply `reportError` on the agent or on `createEvals`. It must
return the UUID of its native diagnostic synchronously, or `undefined` if no
reference is available. A thrown exporter error does not change case results.
Server-owned Studio judging preserves safe failures; it does not gain a private
archive unless its execution is configured with a diagnostic reporter.

Move behavioral postconditions from `teardown` into `verify`. Return
`{ passed: false, reason, evidence }` for unmet behavior: the case becomes Failed.
Throw for verification infrastructure faults: the case becomes Error. Keep reset
and resource release in teardown; failures there remain Error. There is no
heuristic reclassification of existing teardown exceptions.

Setup no longer consumes the execution deadline. Set `setupTimeoutMs` and
`verificationTimeoutMs` when different allowances are needed; both otherwise
inherit `caseTimeoutMs`. All deadlines remain cooperative, and cleanup waits for
callbacks to settle. No forced termination or transactional rollback is promised.

A required `outputs.return` that is missing now raises
`REASON_TERMINAL_OUTPUT_MISSING`. Optional
`toolExecution: { missingReturnCorrections: 1, maxSteps: 4 }` permits a bounded
output-only correction within the existing step limit. The default is zero.
Already completed business tools are not replayed during this correction; a
provider requesting another business tool receives
`REASON_OUTPUT_CORRECTION_TOOL_DISALLOWED`. Existing terminal-output correction
exhaustion is now a validation failure, not a provider request failure.

The future Errors list, grouping and issue management are separate work. This
change supplies safe failure identity, phase evidence and native diagnostic links.
