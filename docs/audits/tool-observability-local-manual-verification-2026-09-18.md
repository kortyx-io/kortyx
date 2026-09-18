# Local tool usage and manual Studio verification

Verified on 2026-09-18 using built SDK packages, an isolated telemetry API and
Studio, and a disposable PostgreSQL 17 installation. No application project or
production database received fixture traffic. Model-driven exercises use a
local deterministic provider to dispatch tool names and inputs; these are not
live LLM-provider tests.

## Execution exercises

Ran 27 SDK execution/resume outcomes outside the test framework, plus telemetry
disabled and delivery-failure exercises. Inspected the actual authenticated
Studio API responses, including the complete payloads rather than only tool facts.

| Use case | Observed behavior |
| --- | --- |
| Direct success | Original result retained; one start and one success with measured duration; no model request. |
| Returned business denial | One denied attempt with `ACCESS_DENIED`; workflow completed. |
| Thrown business denial | Original application error retained; classified as denied; caught workflow completed. |
| Caught and uncaught faults | Both show tool fault; caught workflow completed and uncaught workflow failed. |
| Unsafe denial code | Replaced with `DENIED`; unsafe code absent from exported payload. |
| Explicit `isError` result | Fault observation; returned value retained. |
| Throwing classifier | Execution succeeded; classifier failure did not replace the result. |
| Nested and parallel tools | Separate calls and outcomes; nested work not mistaken for native adoption. |
| Concurrent child invocations | Success and denial attached to distinct child invocation IDs in the correct workflow/node; root completed. |
| In-flight direct and native cancellation | Cancelled terminal rather than fault; run cancelled. |
| Pre-dispatch local cancellation | Cancelled fact with `executed: false`; tool function not called. |
| Native success, denial and fault | Model-selected labels and separate outcomes; model can continue after denial/fault. |
| Native adapter delegating to same-name `useTool` | Exactly one start and terminal for the native call. |
| Approval rejection | No execution; `APPROVAL_DENIED`; workflow completed. |
| Approval acceptance | Exactly one execution after resume. |
| Interrupt, fork and rollback | Direct calls executed again; completed native call emitted reuse with original attempt/run/branch source and no execution duration. |
| Tool-call budget | Suspended before second dispatch; second function not called and no invented fault. |
| Owned resource cleanup failure | Cleanup attempted once; successful result and run retained. |
| Shared resource | `closeAfterUse: false` respected. |
| Telemetry disabled or delivery throwing | Tool and workflow still completed. |
| Privacy and ownership | All 27 complete Studio responses excluded private input/result/error markers. Tool envelope/payload run, workflow and node ownership matched; reused facts were non-executions with original source. |

## Manual browser inspection

Used Studio directly through the in-app browser. Verified source capability
inspection, denial metrics and cohort-preserving denial links returning a
completed workflow; direct/native labels; fault and cancellation rows; nested
calls; parallel child tools; rejected approvals; and cached fork replay.

Also ran the actual CLI topology command against a separate entry, first as JSON
dry-run and then publishing to the disposable installation. The shared definition
was discovered for both direct and model attachments with safe input fields.
Studio search found the tool with **zero workflow executions**, and its inspector
showed both `Called directly` and `Available to model`. Workflow nodes, tool
execution and model invocation were not executed during discovery; importing the
entry still performs its ordinary top-level initialization.

Manual replay navigation exposed a defect: the original-execution link did not
open Trace, and intercepted navigation could race the closing item inspector.
Fixed the link to use a normal source-run navigation with explicit Trace,
environment and original attempt ownership. Repeated the browser click-through:
the original denied attempt was selected automatically and displayed `Executed:
Yes`. Added a browser regression for this path.

## Follow-up automated checks

Both hydrated browser journeys passed: denial inside a completed workflow, and
replay navigation selecting its original tool attempt. Studio unit tests and type
checks pass. The source integration runner covers SDK → authenticated API → real
PostgreSQL → Studio rendering and existing database projection regressions.

Reproduce the committed integration and browser checks with:

```sh
bash scripts/probe-direct-tool-observability.sh
bash scripts/test-tool-observability-ui.sh
```

The ad hoc manual execution scripts and their detailed run manifests were kept
under `/tmp/kortyx-manual-tools*`; their disposable installation is cleaned up
after verification. No live model inference, live Workfully permission checks or
production Redis persistence is claimed by this local exercise.


## Automatic fault diagnostics follow-up

Tool faults now capture bounded exception type/message automatically, without extra wiring on either direct or model-selected calls. Explicit `isError: true` content is treated as the error message. Messages are exported verbatim; optional `tool.telemetry.error` replacement/suppression runs before export and projection failures cannot affect execution. Exception objects, causes, custom fields, stack fields and raw inputs/results remain excluded.

Verified locally with SDK/API builds, 28 package test tasks, 28 type-check tasks and the OpenTelemetry mapping test. All three disposable-install hydrated browser journeys pass, including an otherwise completed workflow containing a thrown `list_jobs` TypeError and a returned `search_jobs` fault. Both inspectors show Error type/message; private input/result/cause/custom-field markers are absent from the rendered page. The earlier browser rerun failed solely because the standalone inspector uses a dialog rather than the nested run drawer test attribute; the corrected semantic dialog locator passes. This does not retroactively add diagnostics to historical runs.
