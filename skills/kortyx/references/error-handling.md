# Error contracts and recovery

Use `serializeFailure`, `isFailureDescriptor`, `DomainError` and related types from `kortyx` or browser-safe `@kortyx/core/errors`. Verify the installed release includes these exports before suggesting them.

- Handle stable codes and fields rather than matching messages. Provider HTTP failures expose status, retry eligibility and available Retry-After; schema failures use `MODEL_OUTPUT_SCHEMA`, with original issues/cause available on the live ValidationError.
- `serializeFailure` propagates execution cancellation, limits and graph interrupts. Never catch those as ordinary retryable failures.
- Applications own separate retry/correction counters, prompt changes, idempotency and authorization to Continue. No helper silently grants another execution allowance.
- Use `DomainError(domainCode, safeMessage, { details })` only for content explicitly approved for persistence/display. Unknown arbitrary errors get a generic public message; raw causes stay in memory.
- Child failures preserve a safe descriptor across checkpoints; failed calls remain cached. A deliberate child retry requires a distinct stable attempt ID. Parallel results keep input order.
- New execute/resume outcomes expose safe descriptor fields in `error`; HTTP/SSE preserve legacy message fields and add `failure`. React retains the descriptor. Legacy messages/events remain readable but discarded historical metadata cannot be reconstructed.
- Persisted issues replace string field names with `[field]` and omit custom validation prose. Use original live issues for detailed correction prompts when available. Do not put arbitrary provider bodies, tool arguments, tokens or stack traces in error details.
- Verify positive recovery, terminal authorization/refusal behavior, budget enforcement and actual Redis reconstruction before claiming parity. A blocker reproduction passing is not recovery evidence.
