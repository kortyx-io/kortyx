---
id: v0-studio-configuration-reference
title: "Kortyx Studio Configuration Reference"
description: "Reference the deployment components, environment variables, startup order, health checks, and supported self-hosted boundary."
keywords: [kortyx, studio, configuration, environment, containers, reference]
sidebar_label: "Configuration Reference"
---
# Kortyx Studio Configuration Reference

This is the stable deployment boundary for Docker Compose, virtual machines, ECS, Cloud Run, Kubernetes, Terraform, CDK, and equivalent systems.

For a guided installation, begin with [Deploy on a Server](./06-deploy-server.md).

## Components

| Component | Image or dependency | Responsibility |
| --- | --- | --- |
| Studio | `ghcr.io/kortyx-io/kortyx-studio:<version>` | Human observability interface on port `6300` |
| Telemetry API | `ghcr.io/kortyx-io/kortyx-api:<version>` | Authenticated ingestion and Studio reads on port `6400` |
| Database job | API image running `kortyx-studio-db` | Idempotent schema migration and single-Project bootstrap |
| PostgreSQL | PostgreSQL 17 is release-tested | Durable telemetry, projections, Project scope, and key verifiers |

Use the same immutable version tag for both Kortyx images. Published images support Linux AMD64 and ARM64.

## Startup and upgrade order

Run the database operation as a one-shot job before starting or updating the API:

```bash
kortyx-studio-db migrate-and-bootstrap
```

Individual operations are available when an orchestrator separates them:

```bash
kortyx-studio-db migrate
kortyx-studio-db bootstrap
```

Migration and bootstrap are idempotent, so a failed job can be retried. After it succeeds, start the telemetry API and then Studio.

Do not start newer application images against an older schema. Database downgrade is unsupported.

## Telemetry API and database job variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL with provider-required TLS settings |
| `KORTYX_API_KEY_PEPPER` | Yes in production | Independent high-entropy HMAC key for API-key verification |
| `API_HOST` | No | Listen address; container default is `0.0.0.0` |
| `API_PORT` | No | Container port; default is `6400` |

## Database bootstrap variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `KORTYX_TELEMETRY_API_KEY` | Yes | Project-scoped `telemetry:write` credential for SDK producers |
| `KORTYX_STUDIO_API_KEY` | Yes | Project-scoped `studio:read` credential used by Studio |

Raw keys are used to create or replace their verifier records. They are not written to bootstrap logs.

## Studio variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `KORTYX_API_URL` | Yes | Internal telemetry API URL, such as `http://api:6400` |
| `KORTYX_STUDIO_API_KEY` | Yes | Server-only Studio read credential |
| `KORTYX_STUDIO_AUTH_MODE` | Yes remotely | Use `basic` for the current self-hosted release |
| `KORTYX_STUDIO_BASIC_AUTH_USERNAME` | With Basic Auth | Human sign-in username |
| `KORTYX_STUDIO_BASIC_AUTH_PASSWORD` | With Basic Auth | Human sign-in password |
| `PORT` | No | Container port; default is `6300` |

The Studio read key is consumed by the Next.js server and must never be sent to the browser. The telemetry write key belongs only in server-side SDK producers.

## Health and shutdown

| Service | Check |
| --- | --- |
| Telemetry API | `GET /health` on port `6400` |
| Studio | Any HTTP response below `500` on port `6300`; `401` is healthy with Basic Auth |
| PostgreSQL | Provider or orchestrator database readiness check |

The API and Studio handle `SIGTERM` for orchestrated shutdown. PostgreSQL is the durable state boundary; API and Studio containers do not need persistent filesystems.

## Platform mapping

| Requirement | AWS | Google Cloud | Kubernetes |
| --- | --- | --- | --- |
| Containers | ECS/Fargate or EKS | Cloud Run or GKE | Deployments |
| PostgreSQL | RDS PostgreSQL | Cloud SQL for PostgreSQL | Managed/external PostgreSQL |
| Secrets | Secrets Manager | Secret Manager | Secret or ExternalSecret |
| Database operation | One-off ECS task | Cloud Run Job | Job or Helm hook |
| HTTPS and human access | ALB plus VPN/OIDC proxy | Load Balancer plus IAP | Ingress plus auth proxy |

Cloud-provider SDKs are not required by Studio. The platform injects the documented variables and schedules the documented components.

## Supported boundary

### Supported now

- one Project per deployment;
- one API and one Studio replica;
- external PostgreSQL;
- version-pinned AMD64 or ARM64 images;
- externally injected secrets;
- retryable migration/bootstrap jobs; and
- HTTPS and access control supplied at the deployment edge.

### Not yet claimed

- high availability or multi-region recovery;
- horizontal-scaling guarantees and published capacity limits;
- built-in OIDC, users, RBAC, RLS, or audit logs;
- multiple Project administration;
- overlapping remote credential rotation through an Admin API; or
- official Terraform, CDK, or Helm modules.

> **Release boundary:** This is a deployable self-hosted release for controlled environments, not a claim of enterprise-grade high availability.
