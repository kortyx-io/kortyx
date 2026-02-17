# Plan: Reasoning + Interrupt + Structured Data Consolidation

## Objective
Define a clear, low-complexity API and runtime behavior for:
- `useReason`
- `useInterrupt`
- `useStructuredData`

The goal is to keep developer experience simple while preserving robust pause/resume and typed contracts.

## Locked Decisions

### 1) `useReason` is the single LLM entry point
- `useReason` supports typed final output via Zod (`outputSchema`).
- Single-call DX for app code (suspendable await model).
- No explicit first/second `useReason` flow in user code.

### 2) Interrupt handling is internal to `useReason`
- If interrupt is triggered, `useReason` internally:
  1. emits interrupt stream event,
  2. checkpoints,
  3. pauses.
- On user response, runtime resumes and same call site continues.

### 3) No separate `allowInterrupt` flag required
- Interrupt capability is enabled by presence of `interrupt` config.
- If `interrupt` is omitted, `useReason` behaves as non-interrupt reasoning.

### 4) Schema-first interrupt contracts (Zod)
- Interrupt requires two schemas:
  - `interrupt.requestSchema`: payload frontend receives/renders.
  - `interrupt.responseSchema`: payload frontend sends back on resume.
- Final reasoning output uses `outputSchema`.

### 5) `useInterrupt` and `useStructuredData` remain standalone
- Do not nest `useStructuredData` inside `useReason` API.
- Both remain first-class for non-LLM nodes.
- Optional schema support can exist on both primitives.

### 5.1) Interrupt naming
- `useInterrupt` is the generic/manual interrupt primitive.
- `useReason` handles AI-driven interrupt lifecycle when `interrupt` config is provided.
- `useAiInterrupt` is removed.

### 6) Chunked structured output belongs in `useReason`
- In addition to final validated output, `useReason` can stream structured output chunks.
- Modes:
  - `off`
  - `patch` (preferred default for incremental object updates)
  - `snapshot` (full optimistic object snapshots)

### 6.1) Single structured stream protocol (no dual paths)
- We keep one stream chunk type for structured payloads: `structured-data`.
- `useReason` and `useStructuredData` both emit this same type.
- Chunk semantics are encoded in payload metadata (e.g. `mode: "final" | "patch" | "snapshot"`), not by introducing separate stream chunk types.
- This avoids two different structured streaming protocols in frontend consumers.

### 7) Multiple `useReason` calls in one node require operation identity
- User-facing optional identity is `id` (simple DX).
- If omitted, runtime auto-generates identity.
- Prevents ambiguous continuation when a node has multiple reasoning operations.

### 7.1) Stream correlation for parallel text operations
- Runtime emits internal correlation fields to avoid mixed UI rendering:
  - `opId`: unique per operation invocation/run instance.
  - `segmentId`: unique per text stream segment inside an operation.
- User API does not expose `opId`/`segmentId`; they are runtime-managed.
- Frontend groups by `opId` and applies deltas by `segmentId`.

### 8) Resume reliability remains mandatory internally
- High-level DX hides resume internals.
- Runtime still uses persisted resume handles/checkpoints internally for correctness.

### 9) Schema contract consolidation across all three hooks
- Consolidate schema model so developers learn one pattern and reuse it everywhere.
- Standard names:
  - `outputSchema` for final reasoning output,
  - `requestSchema`/`responseSchema` for interrupts,
  - `dataSchema` for structured data payloads.
- Shared envelope/version fields for all typed payload streams:
  - `schemaId`,
  - `schemaVersion`.
- Prefer shared schema fragments/helpers so `useReason` interrupt payloads and `useInterrupt` payloads are contract-compatible.

## Expected Runtime Behavior
1. Node invokes `useReason(...)`.
2. Model either:
   - produces final output directly, or
   - triggers interrupt.
3. On interrupt:
   - stream emits typed interrupt event,
   - checkpoint is saved,
   - run pauses.
4. User responds from UI with typed response.
5. Runtime resumes.
6. Execution continues from paused `useReason` point and resolves final typed output.

## API Direction (Draft)

```ts
type UseReasonArgs<TOutput, TInterruptRequest, TInterruptResponse> = {
  model?: unknown;
  prompt?: unknown;
  id?: string;
  outputSchema: ZodSchema<TOutput>;
  interrupt?: {
    requestSchema: ZodSchema<TInterruptRequest>;
    responseSchema: ZodSchema<TInterruptResponse>;
  };
  structured?: {
    stream?: "off" | "patch" | "snapshot";
    optimistic?: boolean;
  };
};

declare function useReason<
  TOutput = unknown,
  TInterruptRequest = unknown,
  TInterruptResponse = unknown,
>(args: UseReasonArgs<TOutput, TInterruptRequest, TInterruptResponse>): Promise<TOutput>;

type UseInterruptArgs<TRequest, TResponse> = {
  request: TRequest;
  requestSchema?: ZodSchema<TRequest>;
  responseSchema?: ZodSchema<TResponse>;
};

declare function useInterrupt<TRequest = unknown, TResponse = unknown>(
  args: UseInterruptArgs<TRequest, TResponse>,
): Promise<TResponse>;

type UseStructuredDataArgs<TData> = {
  dataType: string;
  data: TData;
  dataSchema?: ZodSchema<TData>;
  schemaId?: string;
  schemaVersion?: string;
  mode?: "final" | "patch" | "snapshot";
};

declare function useStructuredData<TData = unknown>(
  args: UseStructuredDataArgs<TData>,
): void;
```

Notes:
- App code sees one call site.
- Pause/resume lifecycle is internal runtime behavior.

## Optimistic Structured Output Enforcement

### Core rule
- Streamed optimistic object must be validated as **partial** during generation.
- Final object must pass full `outputSchema` before `done`.

### Validation strategy
1. Build `partialSchema = outputSchema.deepPartial()` for streaming phase.
2. For each incoming patch/snapshot:
   - merge into current optimistic object,
   - validate merged object against `partialSchema`.
3. If patch violates `partialSchema`:
   - do not apply/emit invalid state,
   - emit diagnostic chunk (debug/status) for observability.
4. At completion:
   - validate against full `outputSchema`.
   - only then emit final success output.

### Important caveat
- Cross-field constraints/refinements may not be fully decidable until final object.
- Enforce strictly at final validation stage; treat stream validation as shape/type guardrail.

## Schema Correlation for DX

### Goal
- If a developer understands one schema contract, the others should feel familiar.

### Contract consistency rules
1. Use the same naming pattern across APIs:
   - `outputSchema`
   - `interrupt.requestSchema`
   - `interrupt.responseSchema`
   - `dataSchema`
2. Use consistent envelope shapes in stream events:
   - interrupt event: `{ type, requestId, resumeToken, input }`
   - structured event: `{ type, dataType, mode, data, schemaId, schemaVersion }`
3. Keep validation semantics consistent:
   - stream-time: partial/shape guard
   - completion-time: full schema validation

### Should we compare schemas?
- Yes, but at contract design level, not deep runtime equivalence checks.
- Prefer shared base schema fragments and helpers so related schemas are derived from common types.
- Add tests ensuring request/response/output contracts remain version-aligned where required.

## Implementation Phases

### Phase 1: Core suspend/resume runtime
- Implement suspendable `useReason` flow with internal interrupt pause/resume.
- Wire checkpoint + resume mapping to operation identity (`id` or auto-generated).
- Add runtime-generated `opId`/`segmentId` on stream chunks.

### Phase 2: Schema contracts
- Enforce `outputSchema` at completion.
- Enforce `interrupt.requestSchema` before interrupt emission.
- Enforce `interrupt.responseSchema` on resume input.
- Add shared schema helpers to keep interrupt/output contracts visually and structurally aligned.

### Phase 3: Chunked structured output
- Implement `structured.stream` modes (`patch`, `snapshot`).
- Add optimistic object accumulator with partial validation.
- Route all structured updates through the single `structured-data` chunk contract.

### Phase 4: Multi-call safety
- Validate behavior with multiple `useReason` calls in one node.
- Add deterministic resume targeting tests using `id` and auto-generated fallback.
- Add parallel stream tests to ensure text deltas never mix across operations.

### Phase 5: Docs + examples
- Document single-call suspendable pattern.
- Document `useInterrupt` as the generic primitive.
- Add examples:
  - final typed output only,
  - interrupt then resume,
  - chunked structured output,
  - multiple `useReason` with `id`.

## Test Plan
- Unit: final `outputSchema` validation success/failure.
- Unit: interrupt request/response schema validation.
- Unit: patch/snapshot partial validation acceptance/rejection.
- Unit: `useInterrupt` request/response schema validation and resume flow.
- Unit: `useStructuredData` `dataSchema` validation and mode handling.
- Integration: interrupt emitted, checkpoint created, run paused.
- Integration: resume continues same `useReason` and produces typed final output.
- Integration: restart-safe resume with persisted state.
- Integration: multiple `useReason` in one node with distinct `id` values.
- Integration: frontend consumes one structured chunk type from both `useReason` and `useStructuredData`.
- Integration: parallel text streams remain isolated via `opId`/`segmentId`.

## Non-Goals (for now)
- Do not collapse all behavior into a giant helper API.
- Do not require LLM usage for structured-data or interrupt-only nodes.
- Do not expose low-level resume plumbing in standard app DX.

## Review Checklist
- [ ] Single-call DX for `useReason` is preserved.
- [ ] Interrupt is enabled by config presence (no extra flag).
- [ ] `useInterrupt` is the only manual interrupt primitive.
- [ ] Schema contracts are consolidated across `useReason`, `useInterrupt`, and `useStructuredData`.
- [ ] Interrupt request/response are both schema-validated.
- [ ] Chunked optimistic structured output is validated incrementally.
- [ ] Structured streaming uses one chunk type (`structured-data`) with mode metadata.
- [ ] Final output always passes full `outputSchema`.
- [ ] Non-LLM workflows remain first-class.
- [ ] Multi-`useReason` nodes are reliable with optional `id`.
- [ ] Parallel text streams are isolated with runtime `opId`/`segmentId`.
