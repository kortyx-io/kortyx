# Kortyx Studio self-hosted preview

Status: planned first public preview.

Kortyx Studio is now available as a source-available, self-hosted preview for
observing Kortyx SDK applications on a local Docker installation.

## Included

- Runs, Sessions, Workflows, and Interrupts list/detail views.
- Execution stories, trace/event inspectors, payload viewers, timing analysis,
  model latency, token usage, and cost summaries when captured.
- Server-side filtering, sorting, counting, and pagination.
- Live invalidation with bounded fallback refresh.
- Local HTTP Basic Auth with generated credentials.
- Scoped telemetry-write and Studio-read API keys.
- One-command install, health checks, lifecycle commands, deterministic smoke
  validation, and persistent Postgres storage.
- Native Linux AMD64 and ARM64 container images, including Apple Silicon Docker
  Desktop support.

## Deliberately deferred

- Managed Kortyx Cloud and its control plane.
- Cloud login, billing, account provisioning, and team invitations.
- The `Account → Workspace → Project` hierarchy and Project selector.
- Multiple Project administration and cross-Project views.
- Row-level security and granular role-based permissions.
- Project API-key management in the Studio UI.
- Automated backups, high availability, and horizontal scaling.
- Writable third-party interrupt claim/lease/resolve APIs.

The preview uses one implicit local scope with one bootstrapped Project.
Telemetry environments are informative event attributes, not security or
resource-hierarchy boundaries.

## Install

Follow the canonical
[self-hosted preview guide](../studio/self-hosted-preview.md):

```bash
npx kortyx studio start
```

The command generates the sign-in and server-side telemetry configuration. No
default public password is shipped.

## Licensing

Kortyx framework packages, CLI, and API are Apache-2.0. The Studio user
interface is source-available under Elastic License 2.0 and is not presented as
OSI open source. See the [license boundary](../../LICENSES.md).

## Preview expectations

Back up before upgrades. Forward migrations run automatically; database
downgrades are unsupported. The release is intended for local evaluation and
controlled self-hosted use while the broader account, workspace, project,
authentication, and authorization architecture remains under development.
