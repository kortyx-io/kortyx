# Error contracts and recovery

Use `serializeFailure`, `isFailureDescriptor`, `DomainError` and related types from `kortyx` or browser-safe `@kortyx/core/errors`. Verify the installed release includes these exports before suggesting them.

`FailureDescriptor` always contains `version`, `code`, `category`, `message`, and
`retryable`. It may also include `source`, `operation`, `status`, `retryAfterMs`,
`domainCode`, explicitly safe `details`, validation `issues`, usage,
`finishReason`, context, bounded causes, ordered aggregate results, and
`truncated`. Branch on stable codes/fields, not message text or error-class identity
across package copies.

## Inspect and propagate

```ts
import { serializeFailure } from "kortyx";

try {
  await performWork();
} catch (error) {
  const failure = serializeFailure(error);
  // Safe diagnostic fields; keep raw errors in trusted server debugging only.
  console.error(failure.code, failure.status, failure.message);
  throw error; // Replace only with a deliberate application recovery branch.
}
```

`serializeFailure` rethrows cancellation, execution limits and graph interrupts. `isControlFlowError(error)` is available when a catch needs an explicit guard. In client code, import helpers from `kortyx/browser` or `@kortyx/core/errors`, not the server entry point.

Failed `agent.execute`/`agent.resume` outcomes expose the descriptor in `result.error`; do not assume every failure throws. Pre-execution command rejection still throws. Use `isFailureDescriptor` to check values received as JSON; `errorFromFailure` restores a usable Kortyx error, not the original domain class or raw cause.

## Preserve safe domain metadata

```ts
import { DomainError } from "kortyx";

throw new DomainError("SPECIALIST_UNAVAILABLE", "Research is unavailable.", {
  details: { specialist: "research" },
});
```

Catchers classify this using `serializeFailure(error).domainCode`, including after a child checkpoint restore. Adding arbitrary properties to a plain `Error` does not opt them into persistence. The message and details above are an explicit declaration that the content is safe to persist and display.

`DomainError` is not an observability primitive. Throw an ordinary `Error` for an uncaught failure; configured tracing records it automatically before the workflow fails. When a catch deliberately continues with a fallback, call `reportError(error, {severity?, metadata?, tags?})`. It records a handled error on the active span and never changes control flow. Do not manually report an error that will be rethrown.

## Routes and clients

Prefer `createChatRouteHandler({ agent })` for the standard HTTP contract. Custom routes should use `readRequestJson(request)` for object-shaped JSON commands and `createFailureResponse(error)` for safe pre-execution failure responses. See [the custom Next.js route](architecture-nextjs.md#custom-route) for auth, server-derived context and abort propagation.

`createFailureResponse` chooses status from the failure category; its optional second argument is an explicit status override. Application-owned auth responses/redirects should retain their own handling. Do not copy the upstream provider status blindly onto the application's response or convert all errors to HTTP 400.

HTTP rejection bodies expose `{ error: string, failure }`. Stream error chunks expose `{ type: "error", message, failure }`; React error content pieces expose `content` and optional `failure`. Retain the descriptor when adapting these shapes. Accepted execute/resume results still use their result envelope, and errors after SSE headers are sent travel as events. `done` means termination, not success; retain partial output alongside its failure. Server Actions return buffered chunks and should convert ordinary pre-execution errors into an error chunk followed by `done`, while propagating control flow.

Render only the safe descriptor message or an application-owned message selected by
code. Keep raw exceptions and trusted diagnostics in server logs/telemetry:

```tsx
import { isFailureDescriptor } from "@kortyx/core/errors";

function failureFrom(error: Error | null) {
  if (!error || !("failure" in error)) return undefined;
  return isFailureDescriptor(error.failure) ? error.failure : undefined;
}

const failure = failureFrom(chat.error);
const message = failure?.message ??
  (chat.error ? "Something went wrong. Please try again." : null);

return message ? <ErrorBanner>{message}</ErrorBanner> : null;
```

Do not render raw provider bodies, stack traces, arbitrary `Error.message` values,
tool arguments, or telemetry diagnostics. A `DomainError` message/details are an
explicit declaration that those fields are safe to persist and display; do not put
secrets there.

## Recovery policy and compatibility

- Handle stable codes and fields rather than matching messages. Provider HTTP failures expose status, retry eligibility and available Retry-After; schema failures use `MODEL_OUTPUT_SCHEMA`, with original issues/cause available on the live ValidationError.
- Treat `retryable === true` as eligibility, not permission to repeat an operation. `false` is terminal and `null` is unknown; never infer retryability from message prose. Authorization failures and refusals are not schema-correction requests.
- Applications own separate retry/correction counters, prompt changes, idempotency and authorization to Continue. No helper silently grants another execution allowance.
- `withRetries` excludes control flow but defaults to retrying ordinary errors; supply `retryOn` for selective recovery and forward `abortSignal`. Node `behavior.retry` is also broad. Do not wrap schema correction in an indiscriminate retry loop.
- Child failures preserve a safe descriptor across checkpoints; failed calls remain cached. A deliberate child retry requires a distinct stable attempt ID. Parallel results keep input order.
- Upgrade dependent packages together. Legacy message-only events/checkpoints remain readable but discarded metadata cannot be reconstructed; never require new fields from an old server. Preserve legacy display text while treating classification as unknown.
- Generic public messages, corrected default HTTP statuses, shared provider error constructors and explicit malformed/truncated stream failures are behavioral compatibility changes. Use descriptor `source` when available, rather than a provider package's constructor identity, to distinguish providers.
- Persisted issues replace string field names with `[field]` and omit custom validation prose. Use original live issues for detailed correction prompts when available. Do not put arbitrary provider bodies, tool arguments, tokens or stack traces in error details.
- Verify positive recovery, terminal authorization/refusal behavior, budget
  enforcement, and reconstruction with the application's actual production
  persistence adapter before claiming parity. A blocker reproduction passing is
  not recovery evidence.


## Internal error tracing diagnostics

Configured tracing automatically records bounded type, message, stack and cause details for thrown workflow/model errors. `reportError` creates the same trusted diagnostic for a handled error while leaving the span successful. Messages, stacks and causes are exported verbatim and can contain sensitive text. The trace adapter `error` projection can replace or suppress diagnostics; tool `telemetry.error` retains its narrower tool-fault projection. This tracing policy does not change client-facing `serializeFailure`, HTTP responses or returned execution failure descriptors. Keep Studio/internal logs access-controlled.
