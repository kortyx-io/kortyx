# Deploy Kortyx Studio on a server

This guide runs Kortyx Studio with an external PostgreSQL database. It is the
portable starting point for a VM, ECS, Cloud Run, Kubernetes, or infrastructure
as code. It does not install TLS, a reverse proxy, PostgreSQL, or a cloud secret
manager for you.

For a laptop installation with bundled PostgreSQL, use
[`npx kortyx studio start`](./self-hosted-preview.md) instead.

## Prerequisites

- Docker Engine with Docker Compose v2, or an equivalent container platform;
- a PostgreSQL database reachable from the telemetry API and database job;
- a pinned Kortyx Studio release tag; and
- HTTPS plus an access boundary before exposing Studio remotely.

## 1. Prepare deployment files

Download or copy these files from the same Kortyx release:

- [`compose.external-postgres.yml`](../../deploy/studio/compose.external-postgres.yml)
- [`external-postgres.env.example`](../../deploy/studio/external-postgres.env.example)

Set the downloaded Compose path, create a private deployment directory, and
copy the example:

```bash
compose_file=/path/to/compose.external-postgres.yml
deployment_dir=/path/to/private/kortyx-studio
mkdir -m 700 "$deployment_dir"
cp /path/to/external-postgres.env.example "$deployment_dir/deployment.env"
chmod 600 "$deployment_dir/deployment.env"
```

Generate a fresh credential set without creating local Studio state:

```bash
npx kortyx studio credentials --generate
```

The command does not persist the result. Put the values directly into your
secret manager, or into `deployment.env` for a controlled single-server
installation. Do not commit the populated file or paste its output into a
ticket, chat, build log, or screenshot.

Set `DATABASE_URL` and replace `vX.Y.Z` with an immutable published release.
For a network database, use its required TLS mode and CA configuration. With a
provider that supplies a publicly trusted certificate, a typical URL ends in
`?sslmode=verify-full`. Percent-encode reserved characters in database
usernames and passwords before placing them in a connection URL.

## 2. Start the deployment

```bash
docker compose \
  --env-file "$deployment_dir/deployment.env" \
  -f "$compose_file" \
  up -d --wait --wait-timeout 180
```

Compose runs the retryable database job first, then starts the API and Studio.
The default host bindings are loopback-only:

- Studio: `http://127.0.0.1:6300`
- telemetry API: `http://127.0.0.1:6400`

Keep those defaults when a reverse proxy runs on the same server. Container
platforms should route directly to ports `6300` and `6400` instead of exposing
both services publicly.

Check health and logs:

```bash
curl --fail http://127.0.0.1:6400/health
docker compose \
  --env-file "$deployment_dir/deployment.env" \
  -f "$compose_file" \
  ps
docker compose \
  --env-file "$deployment_dir/deployment.env" \
  -f "$compose_file" \
  logs --tail 200
```

## 3. Connect a Kortyx SDK application

Give the SDK application's server runtime only these values:

```bash
KORTYX_TELEMETRY_API_URL=https://telemetry.example.com
KORTYX_TELEMETRY_API_KEY=ktyx_live_...
KORTYX_TELEMETRY_ENVIRONMENT=production
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

The telemetry endpoint must be reachable by the application server. The API
key must never enter a browser bundle.

## Upgrade

1. Back up PostgreSQL and the deployment secrets.
2. Change `KORTYX_STUDIO_IMAGE_TAG` to the next supported release.
3. Pull the images.
4. Run `db-init` and wait for success.
5. Recreate the API and Studio services.

```bash
docker compose --env-file "$deployment_dir/deployment.env" -f "$compose_file" pull
docker compose --env-file "$deployment_dir/deployment.env" -f "$compose_file" run --rm db-init
docker compose --env-file "$deployment_dir/deployment.env" -f "$compose_file" up -d --wait api studio
```

Database downgrade is unsupported. Restore a backup made for the older version
if its schema is incompatible.

## Cloud deployment

An infrastructure tool should translate the same three services rather than
run Compose verbatim:

1. one retryable job using the API image and
   `kortyx-studio-db migrate-and-bootstrap`;
2. one long-running API service;
3. one long-running Studio service; and
4. one externally managed PostgreSQL database.

Reference secret-manager entries from the task or workload definition. Do not
put secret values in Terraform variables, generated manifests, or CDK source.
See the [deployment contract](./deployment-contract.md) for the complete
configuration and platform mapping.
