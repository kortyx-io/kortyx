# Migrating eval settings and error evidence

Apply SQL migration `0013_eval_settings` before starting the new Studio API. It
adds `projects.eval_defaults`, `eval_runs.termination` and `eval_runs.issue`.
Defaults are sparse JSON; there is no result backfill. Previously discarded
exceptions and historical timeout reasons cannot be reconstructed.

Deploy API and Studio together before upgrading `kortyx`, `@kortyx/agent`,
`@kortyx/hooks`, `@kortyx/runtime`, `@kortyx/core`, `@kortyx/telemetry-contracts`
and `@kortyx/cli` from the same release. Older strict validators may reject new
optional error/settings fields. Roll back consumer emitters before API/Studio;
the additive columns may remain. Existing SDKs still run; case-timeout overrides
require the new advertised capability and are rejected for legacy consumers.

Original exceptions are now captured inline for eval failures by default,
including native workflow errors, hook errors and Studio grading/transport errors.
Studio displays message, type, stack, causes and response properties without an
opt-in flag or custom reporter. Known credential fields, headers and patterns are
redacted; ordinary exception content is retained. The existing diagnostic
serializer bounds capture and reports truncation. This changes authenticated eval
evidence, not public chat's safe failure descriptors. Keep eval-reader permissions
scoped to authorized project users.

Native diagnostic references are optional additional evidence, loaded
automatically under existing project/environment permissions. Reporter/exporter
failures cannot alter the original result. An old record with only a discarded
message has no way to recover it; Studio says so. OTel alone does not supply a
native archive. Exception payloads stay out of maintainer usage telemetry.

Settings resolve per field as run → Studio project → SDK declared → built-in.
The installation overall default remains 30 minutes; optional
`KORTYX_EVAL_MAX_RUN_TIMEOUT_MS` is an independent ceiling. Defaults and source
metadata are frozen at enqueue. Whole-evaluation timeout includes all suites and
Studio grading, excluding queue time; completed evidence is preserved and
cancellation/cleanup is signalled to active consumers. Aborts remain cooperative.
See [Studio execution](./studio-execution.md#evaluation-settings-and-timeout-reporting)
and [SDK defaults](./sdk-runner.md#execution-defaults-and-application-limits).

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
