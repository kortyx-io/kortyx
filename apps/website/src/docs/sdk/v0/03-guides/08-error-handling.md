---
id: v0-error-handling
title: "Handle Errors and Recovery"
description: "Inspect typed failures, preserve safe domain details across checkpoints, and keep recovery policy separate from control flow."
keywords: [kortyx, errors, retries, validation, recovery, checkpoints]
sidebar_label: "Errors and Recovery"
---

# Handle Errors and Recovery

Kortyx exposes stable failure codes and a JSON-safe `FailureDescriptor`. Use the code and metadata to make recovery decisions. Messages explain a failure to a person; they are not a classification API.

Import server helpers from `kortyx`, or use the browser-safe `@kortyx/core/errors` entry point. `kortyx/browser` also exports the error helpers. `KortyxError`, `DomainError`, `ValidationError`, `ProviderRequestError`, `ProviderConfigurationError`, `WorkflowContractError` and `PersistenceError` extend `Error`.

## Inspect a failure

```ts
import { serializeFailure } from "kortyx";

try {
  await performWork();
} catch (error) {
  const failure = serializeFailure(error);
  console.error(failure.code, failure.message);
  // Decide recovery using failure.code, status and retryable.
}
```

`serializeFailure` propagates cancellation, limits and graph interrupts instead of turning them into ordinary failures. It bounds normal error details and never reads arbitrary getters, response bodies or exception properties. Unknown exceptions produce `EXECUTION_FAILED` with a generic safe message. Live errors retain their original `.message` and `.cause` for trusted server code. `JSON.stringify` of Kortyx error classes uses the safe descriptor.

Descriptors contain `version: 1`, `code`, `category`, `message`, and `retryable`. Retry eligibility is `true`, `false`, or `null` when unknown. Optional fields include `status`, `retryAfterMs`, `source`, `operation`, `issues`, `usage`, `finishReason`, `context`, `cause`, `domainCode`, `details`, and ordered aggregate `results`.

Use `isFailureDescriptor` and `errorFromFailure` for values crossing JSON boundaries. Restoring a descriptor does not recreate an application's original error class or raw cause.

## Report a handled error

Throw an ordinary `Error` when the workflow cannot continue. Configured tracing
records it automatically before normal retry/failure handling. When application
code catches an error and intentionally continues, use `reportError`:

```ts
import { reportError } from "kortyx";

try {
  return await readLatestCandidate(id);
} catch (error) {
  reportError(error, {
    severity: "warning",
    metadata: { candidateId: id },
  });
  return fallbackCandidate(id);
}
```

`reportError` is observation only: it never retries, throws, changes the active
span status or stops the workflow. Do not report and then rethrow the same error;
the uncaught path already records it. `DomainError` is unrelated—it is reserved
for a deliberately public, stable failure contract that must survive persistence.

| Code | Meaning |
| --- | --- |
| `PROVIDER_CONFIGURATION` | Invalid provider settings or unavailable credentials |
| `PROVIDER_HTTP_ERROR` | HTTP rejection; inspect `status` and available `retryAfterMs` |
| `PROVIDER_TRANSPORT_ERROR` | A recognized network/transport exception |
| `PROVIDER_REQUEST_FAILED` | An unclassified provider request failure |
| `PROVIDER_INVALID_RESPONSE` | Malformed provider output or protocol data |
| `PROVIDER_REFUSAL` | Provider refusal; do not treat it as a schema correction request |
| `MODEL_OUTPUT_SCHEMA` | Model JSON does not satisfy `useReason.outputSchema` |
| `INVALID_MODEL_JSON` | The model did not produce valid JSON |
| `OUTPUT_TRUNCATED` | Available finish metadata identifies an output length limit |
| `SCHEMA_VALIDATION`, `INVALID_OUTPUT` | Hook or workflow contract validation failed |
| `WORKFLOW_CONTRACT_ERROR` | Child registration, schema, call identity or replay contract failed |
| `DOMAIN_ERROR` | Application-declared safe domain failure; inspect `domainCode` |
| `PARALLEL_FAILED` | A parallel group failed; inspect its ordered results |
| `PERSISTENCE_ERROR`, `RESUME_FAILED` | Store operation or resume failed |
| `INVALID_REQUEST`, `INVALID_INPUT`, `INVALID_RESUME` | A command or input is invalid |
| `NOT_FOUND`, `UNKNOWN_WORKFLOW` | Requested checkpoint or workflow is unavailable |
| `MALFORMED_STREAM`, `TRUNCATED_STREAM` | Response stream could not be consumed correctly |
| `EXECUTION_FAILED` | An unknown exception; consult trusted server diagnostics |

Existing execution request codes such as `MISSING_CONTRACT` and `CONTRACT_MISMATCH` remain supported. Consumers should tolerate unknown future codes.

## Choose recovery deliberately

Kortyx does not start a retry or correction because metadata is available. Applications choose which operations may be repeated, their attempt budget, delay and idempotency protection. HTTP 408, 429 and 5xx are transient candidates; known terminal quota/authentication reasons can override that classification. Missing metadata is not permission to retry.

Use separate counters for transport retries and structured corrections. For example, a policy can permit one retry for a transient provider HTTP failure and one correction for `MODEL_OUTPUT_SCHEMA`. A correction changes the prompt using the expected schema and available validation issues; repeating the same request is a transport retry. The live `ValidationError.issues` and `.cause` retain original validation information. Persisted issues omit custom messages and replace string field names with `[field]` to avoid exposing data-dependent schema paths. Numeric path positions and issue codes remain available.

Every actual model dispatch consumes the existing shared execution allowance. A correction does not grant another allowance. Available usage on failed or invalid output is recorded once. Refusals, authorization failures, cancellations and human/limit pauses must not enter a correction loop. `withRetries` excludes control flow and supports `abortSignal`, but its default policy retries ordinary errors; use its `retryOn` predicate for selective recovery. Node `behavior.retry` is also a broad ordinary-error retry policy.

## Preserve domain failures across child calls

```ts
import { DomainError, serializeFailure, useWorkflow } from "kortyx";

// In a specialist: these fields are explicitly approved for persistence/display.
throw new DomainError("SPECIALIST_UNAVAILABLE", "Research is unavailable.", {
  details: { specialist: "research" },
});

// In its caller:
try {
  await useWorkflow({ id: "research-attempt-1", workflow: research, input });
} catch (error) {
  const failure = serializeFailure(error);
  if (failure.domainCode !== "SPECIALIST_UNAVAILABLE") throw error;
  // Apply the application's fallback policy.
}
```

`WorkflowCallError` retains the original cause during the current execution and a safe failure descriptor after checkpoint restore. `ParallelError.results` retains normal fulfilled/rejected entries in input order. Its serialized descriptor retains every ordered status and rejected failure within the existing 64-call limit; successful values remain on the live results and child checkpoints rather than being copied into diagnostic payloads.

Failed child calls are cached. An intentional new attempt uses a distinct stable ID, such as `research-attempt-2`, under a bounded application policy. Old message-only checkpoints can resume, but their discarded metadata cannot be recovered or classified from prose.

## Transports, telemetry and compatibility

Failed `agent.execute`/`agent.resume` outcomes include safe structured fields in `result.error`. HTTP failures retain the legacy string `error` and add `failure`. Error stream chunks retain `message` and add `failure`. React keeps these fields on its error object and error content pieces; message-only legacy servers remain supported. Buffered responses retain `{ chunks, text, structured }`.

Request validation errors use client-error statuses; unexpected server errors default to HTTP 500. An explicit route `errorStatus` override remains authoritative. A provider's HTTP status describes the upstream request and does not automatically become the application's HTTP status. Once SSE headers are sent, failures travel as stream events. Partial output followed by an error is still a failed response; `done` means stream termination, not business success.

Malformed stream events surface a typed failure without logging their payload. Intentional cancellation remains separate from network failures. Public transports keep safe failure codes, while trusted Studio/OpenTelemetry observations retain bounded exception diagnostics for debugging. OTel cancellation and suspension do not set error status. Reporter or cleanup failures must not replace an existing primary failure.

Upgrade dependent SDK/provider/runtime packages together. Mixed old/new workers and legacy checkpoints do not establish recovery parity. Safe generic messages, corrected default HTTP statuses and explicit malformed-stream failures are observable changes; replace tests that assert raw public error text with code/metadata assertions. Keep secrets out of `DomainError` messages/details: constructing one is an explicit declaration that those fields are safe to persist.
