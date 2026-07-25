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

## OSS authentication

Kortyx Studio uses a small auth-mode boundary so the OSS build can stay simple
while the managed Cloud Studio can plug in enterprise auth later.

Supported OSS modes:

- `none`: disables Studio human auth. This is the default in development.
- `basic`: protects Studio with HTTP Basic Auth. This is the default in
  production.
- `cloud`: reserved for the private managed Studio build. The OSS build returns
  a clear error if this mode is selected.

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

The Runs, Sessions, and Interrupts Live controls use a same-origin SSE bridge.
Telemetry commits publish compact project-scoped invalidations; server
components then refresh the current route. This avoids fixed polling while
preserving server-side filtering and pagination. When the stream is unhealthy,
Studio uses a jittered 30–60 second fallback and stops it after reconnection.
See [Studio live refresh](../../docs/design-specs/studio-live-refresh.md) for
the security, scaling, failure, and test boundaries.

## Self-hosted OSS stack

From published images:

```bash
curl -fsSL https://raw.githubusercontent.com/kortyx-io/kortyx/main/scripts/install-studio-oss.sh | sh
```

Or explicitly:

```bash
mkdir kortyx-studio
cd kortyx-studio
curl -fsSLO https://raw.githubusercontent.com/kortyx-io/kortyx/main/docker-compose.oss.yml
curl -fsSLo .env https://raw.githubusercontent.com/kortyx-io/kortyx/main/.env.oss.example
# Edit .env and replace all change-me values before keeping this running.
docker compose -f docker-compose.oss.yml up -d
```

From the repository root for local development:

```bash
cp -n .env.example .env
docker compose up --build
```

Then open `http://localhost:6300` and sign in with:

```txt
username: admin
password: kortyx
```

Change the default credentials and API keys in `.env` before using this outside
local development.

To verify the stack with one deterministic telemetry run:

```bash
docker compose --profile smoke up --abort-on-container-exit --exit-code-from smoke smoke
```

The smoke command sends one workflow topology and one successful run through the
Kortyx API, then verifies that `/v1/studio/runs` can read it back.

To update a self-hosted install later:

```bash
docker compose -f docker-compose.oss.yml pull
docker compose -f docker-compose.oss.yml up -d
```

## OSS image release flow

Studio OSS images are published separately from the website.

Publishing a staging version builds and pushes:

```txt
ghcr.io/kortyx-io/kortyx-api:staging-latest
ghcr.io/kortyx-io/kortyx-api:staging-vX.Y.Z
ghcr.io/kortyx-io/kortyx-studio:staging-latest
ghcr.io/kortyx-io/kortyx-studio:staging-vX.Y.Z
```

The staging workflow then runs the image-based compose smoke test against
`staging-vX.Y.Z`.

When the staging image is accepted, run the promotion workflow with the same
version. Promotion does not rebuild images; it retags the tested staging image
digest to:

```txt
ghcr.io/kortyx-io/kortyx-api:vX.Y.Z
ghcr.io/kortyx-io/kortyx-api:latest
ghcr.io/kortyx-io/kortyx-studio:vX.Y.Z
ghcr.io/kortyx-io/kortyx-studio:latest
```
