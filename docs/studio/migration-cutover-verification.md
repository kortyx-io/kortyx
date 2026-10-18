# Native Drizzle cutover: installation verification

Verified on 2026-10-04 for [PR #258](https://github.com/kortyx-io/kortyx/pull/258).
This is evidence for the cutover, not a guarantee for every database or release.

## Artifacts and environment

Manual testing used Docker Desktop on ARM64, production Dockerfiles, Node 22
inside the images, and PostgreSQL 17. Compatibility tests also used PostgreSQL 14.

- Candidate API index: `sha256:099feada30d0a314389d420ebbe0ff5c6169075f7049db448ae0d2c85b93c348`.
- Candidate Studio index: `sha256:4aeaa5487c4a9834bc418e4b395f4feca3399e78f062b9f03469315a98f17f8c`.
- Previous published Studio: `0.11.0`, selected from the public stable manifest.
- Previous API index: `sha256:349a376cd1914e9f59734460cc63fc4716654cc28a6bfc2e4d1b67f80ca6ac0c`.
- Previous Studio index: `sha256:96460abd598440ff97d8b7363a06e1ef0c133f1819feaafe116b480233723b20`.
- Old npm installer: `kortyx@0.14.0`, containing `@kortyx/cli@0.3.0`.

The candidate contains Studio package version `0.12.0`; these images were built
locally, not released or promoted. No live customer database, production
deployment, or real LLM provider was used.

## Results

1. **Fresh install:** the built CLI started the candidate production images.
   Migration, bootstrap, API readiness, Studio health, and the updater passed.
   Native history contained six entries; no legacy ledger was created.
2. **Observe and restart:** synthetic telemetry persisted and was returned by
   authenticated list/detail endpoints. Studio displayed it and opened its run
   details in the browser. Restart preserved it and allowed new telemetry.
3. **Actual SDK execution:** deterministic workflows used `createAgent` and
   `createKortyxTelemetryAdapter` against fresh and upgraded installations.
   Both completed, delivered five events, reported zero dropped events and
   permanent delivery failures, and appeared in Studio. The upgraded run's
   completed node was visible in the topology view.
4. **Published-release upgrade:** the old npm installer created an installation
   with published `0.11.0` images. Telemetry was sent before upgrade. After a
   backup, only the image tag in the saved environment changed; its old Compose
   file was not rewritten. `db:migrate` prepared five legacy entries and native
   Drizzle applied the sixth.
5. **Preservation and retries:** existing telemetry, runs, sessions, project
   identity, API-key hashes/scopes, table OIDs, credentials, and the old ledger
   matched their pre-upgrade values. Legacy history remained at five; native
   history reached six. Retrying initialization and restarting passed the same
   checks. Original API keys accepted new telemetry after upgrade.
6. **Authentication:** unauthenticated API/browser requests returned 401;
   existing Studio-key and browser credentials continued to work.
7. **External PostgreSQL:** the existing deployment smoke passed with candidate
   images, including bootstrap retries, persistence, restart, credential rotation,
   old-key revocation, and telemetry after rotation.
8. **Release upgrade gate:** the new image-upgrade script passed locally from
   `0.11.0` to the candidate, checking row/identity fingerprints, unchanged
   saved Compose and credentials, retry, restart, old-run reads, Studio rendering,
   and new telemetry.

Local checks passed: 183 database tests on PostgreSQL 17, 26 migration scenarios
on PostgreSQL 14, 211 CLI tests, native `db:check`, required core/example
typechecks, and release-workflow regression tests.

## Regression protection and limits

`db:migrate` stays deployment-safe because old installers, saved Compose, and
the updater already call it. `db:migrate-native` explicitly bypasses preparation.
This fixes wiring without another journal validator or SQL execution engine.

Existing AMD64/ARM64 release jobs now also call
`.github/scripts/studio/smoke-upgrade.sh` before production promotion. There is
no additional runner job. Upgrade is explicitly skipped for a missing previous
stable manifest (HTTP 404) or an already-stable candidate. Other fetch/validation
errors fail the test.

Manual Docker/browser verification here was ARM64 only; AMD64 remains the release
job's responsibility. This did not test every Studio feature, enterprise auth,
arbitrary schema drift, real provider calls, or an in-app automatic-update
operation. It did verify the unchanged saved Compose command used by that
operation. Keep backups and require successful release smoke jobs: migration
tests alone are not installation proof.
