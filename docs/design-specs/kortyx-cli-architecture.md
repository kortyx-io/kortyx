# Kortyx CLI architecture

## Product boundary

The `kortyx` binary will support two deliberately separate kinds of command:

1. Local runtime commands operate Docker Compose on the developer's machine.
2. Studio data reads call the existing project-scoped Studio HTTP API; future
   administration commands will call a documented Studio Admin API.

The CLI must not query or mutate the Studio database directly. Keeping the
remote boundary at HTTP makes the same commands usable with local self-hosted Studio,
customer-hosted Studio, and a future Kortyx Cloud control plane.

## Command model

The current local-runtime surface is:

```text
kortyx studio start
kortyx studio stop
kortyx studio restart
kortyx studio status
kortyx studio logs
kortyx studio credentials
kortyx studio credentials --rotate
kortyx studio credentials --generate
kortyx studio reset --confirm
```

These commands own only local Docker lifecycle, generated local credentials,
and the state in `~/.kortyx/studio`. `credentials --generate` creates an
unpersisted initial secret set for operator-managed deployments; it does not
connect to a remote deployment or mutate its database.

The read-only debugging surface now includes `studio inspect`, entity
`list`/`get` commands, `studio workflows list`, `studio catalogs`, and
`studio doctor`. `connections add/list/use/remove` manages API/browser URL
profiles with environment-variable credential references. The reserved local
profile reuses managed local Studio state. See [Studio read CLI](./studio-read-cli.md)
for URL resolution, privacy, output, and authorization boundaries.

Future API-driven commands can grow alongside them:

```text
kortyx login
kortyx profiles
kortyx workspaces list
kortyx projects list
kortyx projects create
kortyx api-keys create
kortyx api-keys revoke
```

Exact names remain a product decision. Their implementation must use an Admin
API client and a selected connection profile rather than importing database
repositories.

## Internal layers

```text
Commander command tree
  ├─ local Studio commands ──> local-stack ──> Execa ──> Docker Compose
  ├─ topology commands ──────> telemetry HTTP API
  ├─ Studio read commands ───> Studio read API client
  └─ future admin commands ──> Studio Admin API client

Zod schemas validate persisted CLI state at every filesystem boundary.
```

- `command.ts` defines command names, help, options, and action routing.
- `local-stack.ts` owns local lifecycle behavior and Docker Compose semantics.
- `runtime.ts` is the process, port, clock, randomness, and output adapter.
- `state.ts` owns versioned configuration, credentials, permissions, and
  validation.
- `compose.ts` is the embedded, versioned local runtime topology.

Business behavior stays independent of Commander and Execa through the
`StudioRuntime` interface. Tests can exercise the complete lifecycle without a
Docker daemon, while a separate smoke test verifies the real containers.

## Library choices

- Commander owns nested commands, option parsing, validation hooks, and help.
- Execa owns subprocess execution and signal/error propagation.
- Zod owns persisted config and credential validation.
- Node crypto remains the source for generated secrets.
- Docker Compose remains the container orchestrator.

Dockerode is intentionally not used: it controls the Docker Engine API but does
not replace Compose's dependency, health, and volume semantics.

Interactive prompts, spinners, shell completion, and update notifications can
be added when the command catalog needs them. Automation-safe flags and stable
machine-readable output should exist before adding interactive-only workflows.

## Connection profiles

Profiles contain locators and authentication references, not
project data:

```text
profile name
Studio/Admin API URL
authentication mode or credential reference
last selected account/workspace/project
```

Local Studio is resolved automatically as `local` after startup. Self-hosted
instances can register additional project-scoped profiles. Remote secrets are
currently injected through named environment variables; raw remote keys are
never saved in profile files. Account login and platform credential-store
integration remain future work; plaintext profile files contain only locators,
references, defaults, and informational project/organization labels.

## Compatibility commitments

- Local data and credentials remain stable across CLI upgrades.
- Persisted state is versioned and validated before use.
- Destructive commands require explicit confirmation.
- Human-readable output is the default; Studio read/connection commands
  provide `--json`.
- Repository development commands remain separate from the external-user CLI.
