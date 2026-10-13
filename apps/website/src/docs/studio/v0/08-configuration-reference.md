---
id: v0-studio-configuration-reference
title: "Kortyx Studio Configuration Reference"
description: "Reference the deployment components, environment variables, startup order, health checks, and supported self-hosted boundary."
keywords: [kortyx, studio, configuration, environment, containers, reference]
sidebar_label: "Configuration Reference"
section: "reference"
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

Migrations hold a PostgreSQL advisory lock across the ordered migration set, so accidentally concurrent jobs serialize. Still schedule one database job per deployment rather than running migrations in every application replica.

Do not start newer application images against an older schema. Database downgrade is unsupported.

## Telemetry API and database job variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL with provider-required TLS settings |
| `KORTYX_API_KEY_PEPPER` | Yes in production | Independent high-entropy HMAC key for API-key verification |
| `API_HOST` | No | Listen address; container default is `0.0.0.0` |
| `API_PORT` | No | Container port; default is `6400` |
| `KORTYX_EVAL_TARGETS_FILE` | With file-based eval targets | API-server path to a private JSON array of application target definitions; unset by default |
| `KORTYX_EVAL_TARGETS` | Alternative to a target file | Inline JSON array with the same target shape; defaults to `[]`; ignored when a target file path is set |

The target file takes precedence over inline JSON. An unreadable or invalid file
fails API startup; it does not fall back to inline targets. Both forms contain
application service keys. Target IDs must be unique. Configure these variables
on the API, and mount the file there if using containers. See
[application registration](./11-evals.md#register-applications-on-the-studio-api-server)
for the target fields and the separate organization/project/environment scope.

### Optional Studio judge variables

Set these on the **API service**, not the browser Studio service. Leaving the
model unset disables Studio judging; an available App judge can still be selected.

| Variable | Required | Purpose |
| --- | --- | --- |
| `KORTYX_EVAL_JUDGE_MODEL` | To enable Studio judging | Provider model ID; use a provider-prefixed slug for OpenRouter |
| `KORTYX_EVAL_JUDGE_API_KEY` | With judge model | Server-owned provider credential |
| `KORTYX_EVAL_JUDGE_API` | No | `responses` (default) or `chat-completions` |
| `KORTYX_EVAL_JUDGE_BASE_URL` | No | HTTPS provider base URL; defaults to OpenAI |
| `KORTYX_EVAL_JUDGE_ID` | No | Saved judge identity; defaults to `studio/openai/<model>`; set an explicit ID for custom endpoints |
| `KORTYX_EVAL_JUDGE_VERSION` | No | Saved rubric identity; defaults to `kortyx-rubric-v4` |

For OpenRouter, set `BASE_URL=https://openrouter.ai/api/v1`,
`API=chat-completions`, the model slug and its API key. See
[Studio judge configuration](./11-evals.md#studio-judge-configuration) for complete
examples and structured-output requirements. Restart the API after configuration
changes. The judge ID/version is saved for comparison, not a snapshot of the
provider's underlying weights or deployment.

Judge strings are trimmed; an empty model disables Studio judging. With a model
set, a missing/empty provider key fails API startup. Invalid API mode or a
non-HTTPS custom base URL also fails startup. `responses` uses `/responses`;
`chat-completions` uses `/chat/completions`. Supply the provider's base URL,
not its full operation path. The backend does not infer the API mode from the
hostname. Change the judge ID/version when deliberately changing your evaluator
so saved comparisons can distinguish the new configuration.

## Database bootstrap variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `KORTYX_TELEMETRY_API_KEY` | Yes | Project-scoped `telemetry:write` and `prompt:serve` credential for SDK producers |
| `KORTYX_STUDIO_API_KEY` | Yes | Project-scoped Studio operator credential with all OSS feature permissions |

OSS bootstrap grants `studio:read`, `studio:write`, `diagnostics:read`, `eval:run`,
`prompt:promote`, `prompt:review`, and `prompt:settings` to the configured Studio
key. Prompts, reviews, diagnostic access and eval execution need no feature
switches. Eval applications and a judge still require configuration before use.

On upgrade, rerun bootstrap with the same stored keys and pepper. The former
`KORTYX_STUDIO_ENABLE_*` switches are ignored, even when old environment files
set them to `0`. Custom keys retain their configured scopes; API authentication,
project/environment isolation and permission checks remain enforced.

Raw keys are used to create or replace their verifier records. They are not written to bootstrap logs.

Reviews share a pseudonymous actor identity per Studio key; they do not imply
individual Cloud Studio accounts.

Complete error diagnostics are enabled by default in the native Studio SDK
adapter. Set `diagnostics: { enabled: false }` there to disable complete capture
and uploads. Prompt content and normal input/output capture remain opt-in.
Configure
`KORTYX_DIAGNOSTIC_RETENTION_DAYS` on the API for completed diagnostic retention
(default 30 days, valid range 1–365) and `KORTYX_DIAGNOSTIC_PROJECT_BYTES` for
the per-project diagnostic budget (default 268435456 bytes / 256 MiB). Invalid
values fall back to those defaults. Container deployments must explicitly
forward these API settings when overriding them.

## Studio variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `KORTYX_API_URL` | Yes | Internal telemetry API URL, such as `http://api:6400` |
| `KORTYX_STUDIO_API_KEY` | Yes | Server-only Studio operator credential |
| `KORTYX_STUDIO_AUTH_MODE` | Yes remotely | Use `basic` for the current self-hosted release |
| `KORTYX_STUDIO_BASIC_AUTH_USERNAME` | With Basic Auth | Human sign-in username |
| `KORTYX_STUDIO_BASIC_AUTH_PASSWORD` | With Basic Auth | Human sign-in password |
| `PORT` | No | Container port; default is `6300` |

The Studio operator key is consumed by the Next.js server and must never be sent to the browser. The telemetry write key belongs only in server-side SDK producers.

The same Studio key can execute suites when it also has `eval:run`. This does
not require a new user-authentication mechanism. See [Evals](./11-evals.md) for
consumer endpoint registration, target-file mounts and execution behavior.

## Consumer application and CLI configuration

### Maintainer usage telemetry

OSS Studio browser/server/API operations and CLI setup send bounded usage
aggregates to Kortyx's EU PostHog project by default. These measure product
adoption, outcomes and latency separately from customer execution data stored in
your Studio database. No consumer PostHog account or personal API token is needed.
There is no autocapture, session replay or global exception collection.

| Variable | Effect |
| --- | --- |
| `KORTYX_USAGE_TELEMETRY_DISABLED=1` | Disables collection, identity creation and delivery; `true` is also accepted |
| `KORTYX_USAGE_TELEMETRY_DEBUG=1` | Prints approved aggregates locally without creating identities or sending requests |
| `KORTYX_USAGE_TELEMETRY_POSTHOG_HOST` | Overrides the default `https://eu.i.posthog.com` ingestion host |
| `KORTYX_USAGE_TELEMETRY_POSTHOG_KEY` | Overrides the public capture key; never use a personal API token |
| `KORTYX_USAGE_TELEMETRY_ENDPOINT` | Uses a compatible collector instead of direct PostHog delivery |

Set controls on both API and Studio containers, and on the CLI process when
running setup. CLI-generated Compose forwards these controls to its services.
Restart containers after changes. Studio supplies public browser configuration
from its server environment; no `NEXT_PUBLIC_` variables are needed.

Records allow fixed operations, outcomes and bounded dimensions. They exclude
customer content, resource names, URLs, customer IDs, credentials, raw error
messages and stacks. Node clients lazily store a pseudonymous random UUID at
`~/.config/kortyx/usage-id`, falling back to a process UUID. The browser stores a
separate UUID in local storage at `kortyx.usage.id`, with an in-memory fallback.
Deleting the corresponding value and restarting/reloading resets that identity.
Network infrastructure still sees the request's source IP.

Delivery aggregates over 60-second windows, buffers at most 64 groups per client
and sends at most 120 groups per hour per component/process. Delivery is best
effort, with a two-second timeout and no retries; offline or terminated clients
can lose records. See the [usage telemetry package reference](https://github.com/kortyx-io/kortyx/tree/main/packages/usage-telemetry)
for the complete controls and scope of the first instrumentation slice.

### Application eval settings

`createEvals` and `createEvalRouteHandler` do not read environment variables
automatically. Your app chooses its server configuration and passes the values
into these functions. These are example application settings, not mandatory
Kortyx variable names:

| Application setting | Where it is used | Behavior |
| --- | --- | --- |
| `EVAL_SERVICE_KEY` | `createEvalRouteHandler({ serviceKey })` | App-owned secret of at least 32 characters; must match the Studio target's `serviceKey` |
| Test actor token, username/password, or identity configuration | App-owned setup/execute helpers | Bind the normal app permissions and accessible data; never publish credentials in suite params |
| App judge's provider variables, such as `OPENROUTER_API_KEY` | The app's configured Kortyx provider | Needed only when using that code judge/provider; independent of `KORTYX_EVAL_JUDGE_API_KEY` on Studio |

An app may gate endpoint registration behind its own feature flag. Kortyx has no
universal `EVAL_ENABLED` flag and does not acquire test-user tokens. If test-user
credentials expire, update or reacquire them through app-owned setup. Studio does
not refresh them. Judge-provider variables do not configure the model used by
the workflow being evaluated.

| CLI variable | Default / meaning |
| --- | --- |
| `KORTYX_STUDIO_HOME` | Local state directory; defaults to `~/.kortyx/studio`; overridden by `--home` |
| `KORTYX_CONFIG_HOME` | Connection profile directory; defaults to `~/.kortyx`; overridden by `--config-home` |
| `KORTYX_CONNECTION` | Connection profile selection; an explicit `--connection` wins, followed by the saved default and then `local` |
| Any key variable named by `--api-key-env`, such as `KORTYX_DEPLOY_EVAL_KEY` | Your chosen variable holds the project Studio key; this example name has no special built-in behavior |

CLI profiles store the variable name and URLs, not the raw remote key. The CLI
passes run selection to Studio; provider and actor credentials stay on their
respective servers. See [CLI commands](./04-cli-commands.md#eval-suites-and-post-deployment-ci)
for connection registration and post-deployment execution.

## Applying eval configuration changes

| Change | Apply it to |
| --- | --- |
| Target file, inline targets or Studio judge variables | Restart/recreate every Studio API replica with the updated environment/mount |
| Upgrade an existing OSS Studio key to default feature permissions | Rerun database bootstrap with the current stored keys and pepper |
| Studio API URL/project key or Basic Auth settings | Restart/recreate the Studio server; key rotation also needs matching bootstrap verifiers |
| Actor credentials, eval service key or code judge | Restart/reconfigure the consumer app; service-key changes also need the matching Studio target update |
| CLI connection/key variables | Supply them to the invoking shell or CI job; no Studio restart is needed for CLI profile edits |

The CLI-generated Compose stack forwards judge settings to the API. Store them
in the existing private Studio home `.env`; `studio start --home <path>` preserves
them. Target file mounts and API target variables still need a deployment
override: adding a host variable
alone does not mount a file or forward it into a container. See
[container configuration](./11-evals.md#container-configuration) for the API
target file override.

## Health and shutdown

| Service | Check |
| --- | --- |
| Telemetry API liveness | `GET /live` on port `6400`; `/health` is a compatibility alias |
| Telemetry API readiness | `GET /ready` on port `6400`; checks traffic acceptance and PostgreSQL |
| Studio | Any HTTP response below `500` on port `6300`; `401` is healthy with Basic Auth |
| PostgreSQL | Provider or orchestrator database readiness check |

On `SIGTERM`, the API stops readiness, drains HTTP for up to 25 seconds, then closes PostgreSQL connections. Set the termination grace period above 25 seconds. PostgreSQL is the durable state boundary; API and Studio containers do not need persistent filesystems.

## Platform mapping

| Requirement | AWS | Google Cloud | Kubernetes |
| --- | --- | --- | --- |
| Containers | ECS/Fargate or EKS | Cloud Run or GKE | Deployments |
| PostgreSQL | RDS PostgreSQL | Cloud SQL for PostgreSQL | Managed/external PostgreSQL |
| Secrets | Secrets Manager | Secret Manager | Secret or ExternalSecret |
| Database operation | One-off ECS task | Cloud Run Job | Job or Helm hook |
| HTTPS and human access | ALB plus VPN/OIDC proxy | Load Balancer plus IAP | Ingress plus auth proxy |

Cloud-provider SDKs are not required by Studio. The platform injects the documented variables and schedules the documented components.

The `@kortyx/aws-cdk` package implements a convenient single-task AWS mapping. Use lower-level ECS/EKS resources and the [High Availability contract](./10-high-availability.md) when you need multiple replicas.

## Supported boundary

### Supported now

- one Project per deployment;
- one or more API and Studio replicas, with two recommended for production;
- external PostgreSQL;
- version-pinned AMD64 or ARM64 images;
- externally injected secrets;
- retryable, serialized migration/bootstrap jobs;
- cross-replica live invalidations through PostgreSQL;
- rolling deployments for releases explicitly marked `rolling`; and
- HTTPS and access control supplied at the deployment edge.

### Not yet claimed

- database high availability or multi-region recovery;
- unlimited horizontal scaling or published capacity limits;
- built-in OIDC, users, RBAC, RLS, or audit logs;
- multiple Project administration;
- overlapping remote credential rotation through an Admin API; or
- official Terraform or Helm modules.

Continue with [High Availability](./10-high-availability.md) for the complete multi-replica, migration, health, and release contract.
