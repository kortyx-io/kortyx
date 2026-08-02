# Kortyx Studio deployment contract

Kortyx Studio is distributed as two OCI images and requires PostgreSQL. This
contract is the stable boundary for Docker Compose, virtual machines, ECS,
Cloud Run, Kubernetes, Terraform, CDK, and other deployment systems.

The initial supported remote topology is a single Studio instance, a single
telemetry API instance, one Project, and an externally managed PostgreSQL
database. Kortyx agents keep running if Studio is unavailable; Studio is an
observability system, not the agent execution control plane.

## Components

| Component | Published image or dependency | Responsibility |
| --- | --- | --- |
| Studio | `ghcr.io/kortyx-io/kortyx-studio:<version>` | Human observability interface on port `6300` |
| Telemetry API | `ghcr.io/kortyx-io/kortyx-api:<version>` | Authenticated telemetry ingestion and Studio reads on port `6400` |
| Database job | Kortyx API image with `kortyx-studio-db` | Idempotent schema migration and single-Project bootstrap |
| PostgreSQL | PostgreSQL 17 is release-tested | Telemetry, projections, Project scope, and API-key verifier records |

Use the same immutable version tag for both Kortyx images. The published
images support Linux AMD64 and ARM64.

## Startup and upgrade order

Run the database operation as a one-shot job before starting or updating the
API:

```bash
kortyx-studio-db migrate-and-bootstrap
```

Individual operations are also available:

```bash
kortyx-studio-db migrate
kortyx-studio-db bootstrap
```

All commands require `DATABASE_URL`. Bootstrap also requires the API-key
pepper, telemetry write key, and Studio read key. Migration and bootstrap are
idempotent, so a failed deployment job can be retried. Operator-provided raw
keys are not written to bootstrap logs.

After the job succeeds, start the API and then Studio. Do not start newer
application images against an older schema. Database downgrade is unsupported;
restore the matching backup when rolling back across an incompatible schema.

## Configuration

### Telemetry API and database job

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL; use provider-required TLS settings |
| `KORTYX_API_KEY_PEPPER` | Yes in production | Independent high-entropy HMAC key used to verify API-key secrets |
| `API_HOST` | No | Listen address; container default is `0.0.0.0` |
| `API_PORT` | No | Container port; default `6400` |

### Database bootstrap job only

| Variable | Required | Purpose |
| --- | --- | --- |
| `KORTYX_TELEMETRY_API_KEY` | Yes | Project-scoped `telemetry:write` credential for SDK producers |
| `KORTYX_STUDIO_API_KEY` | Yes | Project-scoped `studio:read` credential used only by Studio |

### Studio

| Variable | Required | Purpose |
| --- | --- | --- |
| `KORTYX_API_URL` | Yes | Internal URL of the telemetry API, such as `http://api:6400` |
| `KORTYX_STUDIO_API_KEY` | Yes | Server-only Studio read credential |
| `KORTYX_STUDIO_AUTH_MODE` | Yes remotely | `basic` for the self-hosted preview |
| `KORTYX_STUDIO_BASIC_AUTH_USERNAME` | With Basic Auth | Human sign-in username |
| `KORTYX_STUDIO_BASIC_AUTH_PASSWORD` | With Basic Auth | Human sign-in password |
| `PORT` | No | Container port; default `6300` |

The Studio read key is consumed server-side by Next.js and must never be sent
to the browser. The telemetry key belongs only in server-side SDK producers.

## Credential storage model

The raw API key belongs in the operator's secret manager and in the service
that presents it. Kortyx PostgreSQL stores only the key identifier, a one-way
HMAC verifier, Project ownership, scopes, expiry, revocation state, and usage
metadata. A database export therefore does not directly contain usable API
keys.

The API-key pepper is not an API key. Keep it stable and back it up separately;
changing it invalidates every API-key verifier in that deployment.

See [Credentials and secrets](./credentials-and-secrets.md) for initial
generation and rotation.

## Networking and authentication

- Terminate HTTPS before Studio and the telemetry API.
- Keep PostgreSQL private.
- Restrict the telemetry API to SDK producer networks where possible.
- Keep the API and Studio on a private service network.
- Use Basic Auth only over HTTPS. For broader team access, put Studio behind a
  VPN or identity-aware access proxy.
- Do not expose internal service ports merely because a container platform can
  assign public addresses.

The telemetry API authenticates every telemetry and Studio data request with a
Project-scoped bearer key. Health endpoints intentionally do not require an API
key.

## Health and lifecycle

- API liveness: `GET /health` on port `6400`.
- Studio container health: an HTTP response below `500` on port `6300`; a `401`
  is healthy when Basic Auth is enabled.
- The API and Studio handle `SIGTERM` for orchestrated shutdown.
- PostgreSQL is the durable state boundary; API and Studio containers do not
  require persistent filesystems.

## Platform mapping

| Requirement | AWS | Google Cloud | Kubernetes |
| --- | --- | --- | --- |
| Containers | ECS/Fargate or EKS | Cloud Run or GKE | Deployments |
| PostgreSQL | RDS PostgreSQL | Cloud SQL for PostgreSQL | Managed/external PostgreSQL |
| Secrets | Secrets Manager | Secret Manager | Secret or ExternalSecret |
| Database operation | One-off ECS task | Cloud Run Job or deployment job | Job or Helm hook |
| HTTPS and human access | ALB plus VPN/OIDC proxy | Load Balancer plus IAP | Ingress plus auth proxy |

Kortyx does not need cloud-provider SDKs to support these platforms. Their
orchestrators inject secret values into the documented variables. Native
Terraform, CDK, and Helm packaging can consume this contract later without
changing the application.

## Initial support boundary

Supported now:

- one Project per deployment;
- one API and one Studio replica;
- external PostgreSQL;
- version-pinned AMD64 or ARM64 images;
- externally injected secrets;
- retryable migration/bootstrap jobs;
- HTTPS and access control supplied at the deployment edge.

Not yet claimed:

- high availability or multi-region recovery;
- horizontal-scaling guarantees and published capacity limits;
- built-in OIDC, users, RBAC, RLS, or audit logs;
- multiple Project administration;
- managed credential rotation through a remote Admin API;
- official Terraform, CDK, or Helm modules.

This is a deployable self-hosted preview, not a claim of enterprise-grade high
availability.
