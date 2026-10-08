# Native diagnostic manual end-to-end test

Use a disposable local Studio PostgreSQL database. Migrate it and bootstrap a telemetry writer plus a Studio reader with `KORTYX_STUDIO_ENABLE_DIAGNOSTICS=1`. Start the API and Studio against that database, with the reader configured server-side in Studio. Do not use production or customer credentials/data for this fixture.

Build the package graph first:

```sh
pnpm exec turbo run build --filter=@kortyx/api --filter=@kortyx/cli --filter=@kortyx/agent
KORTYX_API_URL=http://127.0.0.1:6458 \
KORTYX_TELEMETRY_API_KEY=<local-writer> \
KORTYX_STUDIO_API_KEY=<local-reader> \
node test/diagnostics/manual-fixture.mjs
```

The script starts an ephemeral local provider returning HTTP 400 and runs a real agent route. It asserts safe public HTTP/SSE, a complete 301 KB redacted diagnostic, a 60 Ki-character UTF-8 field, an over-limit-for-summary message and stack, 17 cause levels, AggregateError members, provider response evidence, and a circular reference. It also interrupts a second upload after one of two parts, verifies pending delivery with no published content, and writes IDs/URLs to `/tmp/kortyx-diagnostic-manual-proof.json` (override with `KORTYX_DIAGNOSTIC_FIXTURE_OUTPUT`). Repeated runs generate new disposable IDs.

## Browser and CLI checks

1. Open the emitted complete URL in Studio, adjusting the Studio host/port to your local server. Prefer `localhost` for Next development assets. Verify `available`, capture `complete`, redaction count, and correlation. Pretty previews long strings with their original character counts; JSON and download must retain the full values.
2. Download through Studio. Use `kortyx studio diagnostics get` and `download` against the same API/read key. Verify the two downloaded files are byte-identical and preserve the long strings, cause chain, aggregate member, and reference, with no fixture secret. Default CLI get must omit the content object.
3. Follow the run link, open Events and the failed node drawer, and follow **View diagnostic** back to the same record. Upload parts must not appear as separate event rows. Check the Trace drawer link too.
4. Open the incomplete URL. Verify **Received 1 of 2 parts**, no exception body, and no download link. CLI download must fail without writing a file. Using the telemetry writer as a diagnostic reader must fail with 403. An existing download destination must not be overwritten.
5. Capture a screenshot of the complete diagnostic and record the results. Only synthetic local evidence belongs in repository/PR artifacts.

## Verified on 8 October 2026

Manual Chrome testing against an isolated PostgreSQL 18 cluster, API, and Studio development server passed the complete and interrupted paths. Studio/CLI downloads preserved identical 301,967-byte content. The originating run contained six lifecycle events, with diagnostic upload parts absent. The Events drawer link, Pretty/JSON views, and browser download were exercised. The native fixture verified safe public HTTP/SSE and correlation; credential and incomplete-download negative checks were also performed.

Fresh and legacy database migration integration tests run separately against disposable databases. The migration creates the scoped unique index before the composite parts foreign key. The automated tests are in hooks, telemetry, API, core, CLI, and Studio; the manual script is intentionally repeatable for rollout validation.

The diagnostic workspace polish was checked in the in-app browser against a local Studio production build at desktop, 760 px, and 390 px widths. The bordered detail surface and exception viewer stayed within the viewport; context remained accessible through its tab on narrow screens. JSON and the browser download retained the 9,048-character message, 40,035-character stack, and 61,440-character provider field. The failed-node Events link opened the correct diagnostic. The run summary with the long unbroken message was limited to three lines without widening its drawer. Studio's 245 unit tests and production build passed.
