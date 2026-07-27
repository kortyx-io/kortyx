# Kortyx CLI architecture

## Product boundary

The `kortyx` binary will support two deliberately separate kinds of command:

1. Local runtime commands operate Docker Compose on the developer's machine.
2. Studio administration commands call a documented Studio Admin API.

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
kortyx studio reset --confirm
```

These commands own only local Docker lifecycle, generated local credentials,
and the state in `~/.kortyx/studio`.

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

## Future connection profiles

A future profile should contain locators and authentication references, not
project data:

```text
profile name
Studio/Admin API URL
authentication mode or credential reference
last selected account/workspace/project
```

Local Studio can register a default `local` profile after startup. Cloud and
self-hosted instances can register additional profiles. Secrets must use the
platform credential store when login is introduced; plaintext profile files
should contain only non-sensitive configuration.

## Compatibility commitments

- Local data and credentials remain stable across CLI upgrades.
- Persisted state is versioned and validated before use.
- Destructive commands require explicit confirmation.
- Human-readable output is the default; future automation commands should
  provide `--json`.
- Repository development commands remain separate from the external-user CLI.
