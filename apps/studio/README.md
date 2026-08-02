# Kortyx Studio

Kortyx Studio is the source-available Studio shell for the Kortyx plugin ecosystem.

## License

This app is licensed under the Elastic License 2.0. See `LICENSE.md`.

## Development

```bash
pnpm dev
```

This starts Postgres, the Kortyx API, Studio, and the canvas example for local
development. By default, Studio runs on `http://localhost:6300`.

If you already manage Postgres yourself, run:

```bash
pnpm dev:no-db
```

## Drawer-stack browser regression tests

Studio uses Playwright to protect the intercepting-route detail architecture
covered by KTX-25. The suite exercises the real Studio and telemetry API rather
than mocking drawer components.

Prepare the local database once, then run the suite from the repository root:

```bash
pnpm dev:setup
pnpm test:studio:e2e
```

The command builds the workspace packages needed by the API, starts or reuses
the API and Studio development servers, and runs Chromium. The setup project
sends deterministic `e2e-ktx25-*` telemetry through the ingestion API. Its
teardown project deletes only that scoped fixture from raw telemetry,
projections, and its workflow revision—even after browser-test failures.

The scenarios cover:

- one entry animation across loading and resolved content;
- Session → Run → Trace/Event stacking and ancestor clicks;
- one-layer backdrop, Browser Back, and Browser Forward transitions;
- same-path tab/selection history without close–reopen regressions;
- immediate tab content with an animated inspector exit;
- Interrupt → Run navigation;
- expanded Run geometry, backdrop release, and sidebar access;
- hard-refresh rendering for Session, Run, and Interrupt routes.

Playwright records traces, screenshots, and video only on failures. Reports are
written to `apps/studio/playwright-report`; raw artifacts are under
`apps/studio/test-results`. Tests use web-first assertions and shared motion
state instead of fixed sleeps.

For an interactive runner:

```bash
pnpm --filter kortyx-studio test:e2e:ui
```

## Self-hosted authentication

Kortyx Studio uses a small auth-mode boundary so the self-hosted preview can
stay simple while the managed Cloud Studio can plug in enterprise auth later.

Supported self-hosted modes:

- `none`: disables Studio human auth. This is the default in development.
- `basic`: protects Studio with HTTP Basic Auth. This is the default in
  production.
- `cloud`: reserved for the private managed Studio build. The self-hosted build
  returns a clear error if this mode is selected.

Example self-hosted configuration:

```bash
KORTYX_STUDIO_AUTH_MODE=basic
KORTYX_STUDIO_BASIC_AUTH_USERNAME=admin
KORTYX_STUDIO_BASIC_AUTH_PASSWORD=change-me
```

In production, Basic Auth fails closed if username or password is missing.
Deploy Basic Auth behind HTTPS or a trusted reverse proxy; Basic Auth credentials
are only base64 encoded on the wire.

## Studio API access

The browser authenticates to Studio with Basic Auth. Studio itself reads
telemetry through the Kortyx API using a server-only API key:

```bash
KORTYX_API_URL=http://localhost:6400
KORTYX_STUDIO_API_KEY=ktyx_test_replace_with_bootstrap_studio_read_key
```

`KORTYX_STUDIO_API_KEY` must never be exposed to the browser. The Studio API
client is server-only and should only be imported by server components, route
handlers, or server actions.

The Settings route and sidebar identity use the authenticated
`/v1/studio/context` endpoint. The preview presents one local scope, its
bootstrapped project, observed telemetry environments, API-key mode/scopes, and
API service version. It never returns the read key, key identifier, API URL,
Basic Auth credentials, or raw upstream errors. Settings reports server
configuration as configured/missing and masks the read-key value.

The self-hosted identity menu intentionally contains no account, billing, upgrade,
notification, logout, or other managed-SaaS placeholders. Its supported actions
are Settings, public documentation, and theme selection. Under HTTP Basic Auth,
credential lifecycle belongs to the browser/reverse proxy rather than an
in-app logout control.

Telemetry content policy is producer-controlled: structural telemetry can be
observed without prompt/response content, content is excluded by default, and
the SDK must explicitly opt in. Studio displays this policy but never enables
capture itself.

The Runs, Sessions, and Interrupts Live controls use a same-origin SSE bridge.
Telemetry commits publish compact project-scoped invalidations; server
components then refresh the current route. This avoids fixed polling while
preserving server-side filtering and pagination. When the stream is unhealthy,
Studio uses a jittered 30–60 second fallback and stops it after reconnection.
See [Studio live refresh](../../docs/design-specs/studio-live-refresh.md) for
the security, scaling, failure, and test boundaries.

## Time-range contract

Runs, Sessions, Interrupts, and Workflows share the same server-side time
filter contract: Last hour, 24 hours, 7 days, 30 days, All time, or Custom
range. Relative presets are resolved against the API request time. Custom
ranges are complete absolute ISO timestamps with an explicit offset; the
Studio calendar selects full UTC days and writes normalized `Z` timestamps to
the URL. Missing, reversed, invalid, or timezone-ambiguous custom boundaries
return a visible `400` error instead of silently widening the query.

Workflow metric responses include the absolute cohort boundaries used by the
server. Inspector “View runs” links convert those boundaries to an exact custom
range, and preserve the workflow, version, node, or transition filter, so the
run list represents the same population even as wall-clock time advances.

## Self-hosted preview

The canonical installation path from any Kortyx SDK project is:

```bash
npx kortyx studio start
```

The command generates the Basic Auth password and scoped API keys; no shared
default password is shipped. See the
[self-hosted preview guide](../../docs/studio/self-hosted-preview.md) for the
SDK connection and first-run verification, and the
[self-hosted operations guide](../../docs/studio/self-hosted-operations.md) for
backup/restore, upgrades, reset, security, and troubleshooting.
For a deployment with managed PostgreSQL, use the
[server deployment guide](../../docs/studio/deploy-on-server.md) and its
[portable deployment contract](../../docs/studio/deployment-contract.md).

From the repository root for local development:

```bash
cp -n .env.example .env
docker compose up --build
```

To verify the stack with one deterministic telemetry run:

```bash
docker compose --profile smoke up --abort-on-container-exit --exit-code-from smoke smoke
```

The smoke command sends one workflow topology and one successful run through the
Kortyx API, then verifies that `/v1/studio/runs` can read it back.

## Self-hosted image release flow

Self-hosted Studio images are published separately from the website through the
manual **Release Studio Self-Hosted Images (GHCR)** GitHub Actions workflow.

The workflow builds native `linux/amd64` and `linux/arm64` manifests and pushes:

```txt
ghcr.io/kortyx-io/kortyx-api:staging-latest
ghcr.io/kortyx-io/kortyx-api:staging-vX.Y.Z
ghcr.io/kortyx-io/kortyx-studio:staging-latest
ghcr.io/kortyx-io/kortyx-studio:staging-vX.Y.Z
```

It then installs the packed CLI in an empty directory and tests the staged
images on native AMD64 and ARM64 GitHub runners. Both jobs must pass health,
telemetry read/write, restart persistence, credential stability, documented
lifecycle commands, and database backup/restore checks.

The final job is protected by the `studio-production` GitHub environment.
After manual approval, it promotes the exact tested image-index digests—without
rebuilding—to:

```txt
ghcr.io/kortyx-io/kortyx-api:vX.Y.Z
ghcr.io/kortyx-io/kortyx-api:latest
ghcr.io/kortyx-io/kortyx-studio:vX.Y.Z
ghcr.io/kortyx-io/kortyx-studio:latest
```

The workflow can create the immutable `studio-vX.Y.Z` Git tag after promotion.
Repository setup and release/recovery instructions are in the
[Studio self-hosted release runbook](../../docs/design-specs/studio-oss-release.md).
