---
id: v0-studio-deploy-server
title: "Deploy Kortyx Studio on a Server"
description: "Deploy Kortyx Studio with external PostgreSQL, injected secrets, pinned images, HTTPS, and a portable container contract."
keywords: [kortyx, studio, deploy, docker, postgres, self-hosted]
sidebar_label: "Deploy on a Server"
---
# Deploy Kortyx Studio on a Server

This guide is the portable starting point for a VM, ECS, Cloud Run, Kubernetes, or infrastructure as code. It runs Studio and the telemetry API with an external PostgreSQL database.

It does **not** install TLS, a reverse proxy, PostgreSQL, or a cloud secret manager for you.

> **For a laptop:** Use [Run Studio Locally](./02-run-locally.md). Do not turn the CLI-managed local Compose state into an internet-facing installation.

## Prerequisites

- Docker Engine with Docker Compose v2, or an equivalent container platform;
- PostgreSQL reachable from the telemetry API and database job;
- a pinned Kortyx Studio release tag; and
- HTTPS plus an access boundary before remote exposure.

Read [Credentials and Secrets](./05-credentials-secrets.md) before provisioning values.

## 1. Prepare the deployment

Download these files from the same immutable Kortyx release:

- [`compose.external-postgres.yml`](https://github.com/kortyx-io/kortyx/blob/main/deploy/studio/compose.external-postgres.yml)
- [`external-postgres.env.example`](https://github.com/kortyx-io/kortyx/blob/main/deploy/studio/external-postgres.env.example)

Create a private directory and copy the environment template:

```bash
compose_file=/path/to/compose.external-postgres.yml
deployment_dir=/path/to/private/kortyx-studio

mkdir -m 700 "$deployment_dir"
cp /path/to/external-postgres.env.example "$deployment_dir/deployment.env"
chmod 600 "$deployment_dir/deployment.env"
```

Generate a fresh, unpersisted credential set:

```bash
npx kortyx studio credentials --generate
```

Put those values directly into your secret manager, or into `deployment.env` for a controlled single-server installation. Set `DATABASE_URL` and replace `vX.Y.Z` with an immutable published release.

For a network database, follow the provider's TLS requirements. With a publicly trusted certificate, a typical PostgreSQL URL ends in `?sslmode=verify-full`. Percent-encode reserved characters in database usernames and passwords.

## 2. Start the services

```bash
docker compose \
  --env-file "$deployment_dir/deployment.env" \
  -f "$compose_file" \
  up -d --wait --wait-timeout 180
```

Compose runs the retryable migration/bootstrap job before starting the API and Studio.

The default host bindings are loopback-only:

- Studio: `http://127.0.0.1:6300`
- Telemetry API: `http://127.0.0.1:6400`

Keep loopback bindings when a reverse proxy runs on the same server. On a container platform, route service traffic directly to container ports `6300` and `6400` rather than assigning both services unrestricted public addresses.

## 3. Verify health

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

A Studio health response below `500` is healthy; `401` is expected when Basic Auth protects the route.

## 4. Put access controls in front

Before users or SDK producers connect:

- terminate HTTPS at a trusted load balancer or reverse proxy;
- keep PostgreSQL private;
- restrict the telemetry API to application-server networks when possible;
- keep Studio and the API on a private service network; and
- use Basic Auth only over HTTPS, ideally behind a VPN or identity-aware proxy.

> **Basic Auth is not encryption.** It is only acceptable over HTTPS. Never expose a remote Studio instance over plain HTTP.

## 5. Connect SDK producers

Give the SDK application's server runtime only the telemetry connection values:

```bash file="server environment"
KORTYX_TELEMETRY_API_URL=https://telemetry.example.com
KORTYX_TELEMETRY_API_KEY=ktyx_live_...
KORTYX_TELEMETRY_ENVIRONMENT=production
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

The application server must reach the telemetry endpoint. The key must never enter a browser bundle. Continue with [Connect Your Project](./03-connect-project.md).

## Upgrade

1. Back up PostgreSQL and deployment secrets.
2. Change `KORTYX_STUDIO_IMAGE_TAG` to the next supported release.
3. Pull the images.
4. Run the database job and wait for success.
5. Recreate the API and Studio services.

```bash
docker compose --env-file "$deployment_dir/deployment.env" -f "$compose_file" pull
docker compose --env-file "$deployment_dir/deployment.env" -f "$compose_file" run --rm db-init
docker compose --env-file "$deployment_dir/deployment.env" -f "$compose_file" up -d --wait api studio
```

Database downgrade is unsupported. Restore a backup made for the older release if its schema is incompatible.

## Translate the contract to a cloud platform

Infrastructure tooling should represent the same components rather than run Compose verbatim:

1. one retryable job using the API image and `kortyx-studio-db migrate-and-bootstrap`;
2. one long-running telemetry API service;
3. one long-running Studio service; and
4. one externally managed PostgreSQL database.

Reference secret-manager entries from workload definitions. Do not serialize raw secret values into Terraform state, generated manifests, or CDK source.

Use the [Configuration Reference](./08-configuration-reference.md) to map ports, variables, health checks, startup order, and service responsibilities to your platform.
