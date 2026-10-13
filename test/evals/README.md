# Manual eval diagnostics regression

Build the agent/runtime/telemetry packages and API. Start a local API and Studio
against a disposable PostgreSQL database with the current migrations, a writer
key authorized for diagnostics, and a reader key authorized for Studio eval and
diagnostic reads. Disable Studio auth only for this local fixture.

Run `node test/evals/error-diagnostics.mjs` with `KORTYX_API_URL`,
`KORTYX_TELEMETRY_API_KEY`, `KORTYX_STUDIO_API_KEY`, and `DATABASE_URL`.
The script rejects non-loopback API/database hosts and appends synthetic eval
records. It exercises hook and native workflow failures, a failed postcondition,
and a reset fault. It asserts safe codes, correlation, private retrieval of a
60 KiB response, circular references, and credential redaction.

It writes `/tmp/kortyx-eval-error-proof.json` with seeded IDs and browser routes
(adjust the displayed Studio port if needed). In Studio, inspect each case,
follow View diagnostic, verify the provider field and redaction, and download the
full JSON. Refresh case and diagnostic routes; verify the Failed/Error distinction
and compare postcondition evidence. Existing records without new fields must load.

Only synthetic fixture data is used. Stop the local services and remove the
separate disposable database when no longer needed; do not run against production.
