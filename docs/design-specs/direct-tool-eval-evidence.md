# Direct tool evidence in conversation evals

The evidence gap originates in SDK emission. Studio telemetry and conversation
eval observations are separate paths. A successful metadata event does not imply
that an eval captured the tool's result.

## Investigation

The saved evaluation `fa7a6802-7722-4f88-95cf-cccd86ea9663`, suite run
`73787e00-8bd8-4c54-9eba-6a30eb9158d2`, case `X01`, repetition 1, turn 0
failed while root run `run-92ee07fd-7313-4fc7-8758-8b0144d57e22` completed.
Read-only Studio inspection confirmed successful direct calls to `read_job_brief`
and `read_job_details`, owned by `hiring-monster-brief`, invocation
`da630539-ead6-4d51-b7de-369198a920c0`. Their logical call IDs match the reported
`d7d9202c-81f1-44c3-8e39-a62dea43dac4` and
`9ad0c56b-3837-4da3-b00a-d8b532039c53`.

The saved judge request supported candidate matches but lacked authenticated
results for the brief's salary, modality, positions, description and pitch.
No claim is made about facts absent from that captured evidence.

Before this change:

1. `packages/hooks/src/tool.ts` called `executeObservedTool`, which emitted safe
   telemetry observations and checkpointed metadata. It emitted no public inputs
   or results. `useTool` had no public result-capture option.
2. Model-selected execution in `packages/hooks/src/reason/tools.ts` separately
   emitted public tool events when `toolExecution.emit` was enabled.
3. Runtime child forwarding and `packages/agent/src/orchestrator.ts` bridged
   public events into `streamChat`. They could not forward absent events.
4. `packages/agent/src/evals/stream.ts` collected public fields using
   `captureEvalEvent`; `evidence.ts` selected those events for local and Studio
   grading. Tool result events were already supported by default selection.
   Collection and filtering were therefore downstream of the missing emission.

The registry reported `@kortyx/agent@0.43.1` and `@kortyx/hooks@0.35.6` as current.
The child-read regression was run against the exact `agent-v0.43.1` release tag,
commit `0402d2e9bf1cfca8db58add2cbfaab26636ae3f0`. The tool executed once and
the judge's selected event list was empty. The regression fails there and passes
with this change. Verification uses a deterministic SDK integration fixture,
without rerunning the Workfully evaluation or calling an external model.

## Contract

`useTool({ tool, input, emit: true })` opts into public inputs/results. Per-side
selection uses `emit: { input, output }`. Without opt-in, only names, identities,
ownership, outcome and omission diagnostics enter the public stream. Telemetry
content settings remain independent and metadata-only tool telemetry stays so.

Direct execution uses existing `tool-call-start` and `tool-call-result` events.
An allowlisted `execution` envelope carries workflow/node ownership, child and
parent invocation, run/branch, call attempt, outcome and replay source. Public
input/result content is snapshotted separately from telemetry observations.
Each side is bounded to 16 KiB of UTF-8 JSON; oversize/non-serializable values
are omitted, with reasons, rather than truncated. Public tool-result envelopes
exclude `raw` and provider metadata. Payload content remains application-owned;
there is no general-purpose secret redaction of arbitrary domain results.

Completed child checkpoints carry these public snapshots separately from their
safe telemetry facts. Cached child replay emits the saved input/result with
original tool/workflow attribution, current run/branch, `executed: false` and a
source reference. It does not run a tool to recover evidence. Direct calls in
a restarted node retain their existing non-cached execution semantics.
Parallel graph joins merge the append-only evidence histories by attempt ID.

Eval collection allowlists attribution fields and applies the existing event
selection/custom filter policy. Saved grading reuses the selected evidence; it
does not recover filtered-out data from private runtime state or telemetry.
When a successful read is unavailable, `execution.resultOmitted` distinguishes
disabled capture, size bounds, serialization failure and a missing return.
An eval policy that excludes tool events also excludes those diagnostics.

Historical results cannot be reconstructed from success metadata alone. Deploy
a release containing this change, opt in at the relevant direct reads, keep the
tool event types in eval evidence selection, and rerun the affected case.

## Manual verification — 2026-10-26

A temporary browser page exercised the patched, built SDK through individual
button clicks. No automated test runner or eval suite was executed for this
verification. The direct tool read a local JSON job fixture; the parent called
it through a child workflow, paused for human input, and answered after Continue.
The page displayed events selected by the actual `captureEvalEvent` and
`getEvalGradeEvidence` implementations.

| Manual action | Observed result |
| --- | --- |
| Read with `emit: true` | Selected evidence contained `read_job_brief`, job input, salary, modality, positions, description and pitch, with call/attempt and child workflow ownership. |
| Continue after the parent pause | Answer used the retrieved data; actual reads remained at one. Reused evidence retained the same call ID and child ownership, with `executed: false` and source attribution. |
| Replay the JSON-persisted selected evidence | The same result remained available; actual reads remained at one. |
| Read and Continue with capture disabled | The answer still used the data. Selected evidence contained explicit disabled-capture diagnostics and no input/result payload. Only the new read increased the cumulative count, to two. |
| Read and Continue with an oversized result | The workflow still answered; selected evidence omitted the result in full with `content exceeds 16 KiB`. Only the new read increased the cumulative count, to three. |

The normal read used run ID
`run-94cb6ca3-dcdf-4ff1-9463-ad56fa1df77f`, child invocation
`4285e959-0031-41ed-9f9d-1ab270524981`, and call ID
`ddca43c0-cf27-46ba-afe3-1b15b1fac1a3`. These are local fixture identities,
not saved Workfully/Studio run records.

This manually verifies SDK emission, selection and replay. It does not verify a
deployed Workfully integration or an external judge model's verdict. The saved
Workfully evaluation was not rerun.
