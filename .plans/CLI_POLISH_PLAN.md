# Kortyx CLI Polish Plan

## Goal

Make the Kortyx CLI a proper product surface for OSS and cloud workflows.

Topology publishing is the first serious command, but the CLI should also become the operational interface for managing Studio, especially LLM Studio access.

The CLI should make this flow explicit:

1. Developers define workflows in code.
2. CI/deploy pushes declared topology to the Kortyx API.
3. Runtime telemetry sends actual runs/events.
4. Studio reads both and shows the latest known topology plus runtime metrics.
5. Operators/admins use the CLI to configure Studio access, API keys, and eventually managed/cloud Studio resources.

`createAgent(...)` should not be treated as the reliable topology discovery mechanism. It only executes when app/framework code imports it, and that is too framework-dependent. The reliable contract is an explicit CLI command.

## CLI framework recommendation

Use a real CLI framework instead of hand-rolled argument parsing.

Recommended: `commander`

Reasons:

- Mature, simple, low maintenance.
- Good subcommand support.
- Good generated help output.
- Good enough for OSS users; no heavy framework ceremony.
- Works well with TypeScript and bundled CLI builds.
- Easy to test command parsing separately from command execution.

Alternatives considered:

- `cac`: very small and ergonomic, but less standard for larger CLIs.
- `clipanion`: strong typing, but less familiar and more framework-specific.
- `oclif`: powerful, but too heavy for current needs.

Decision: use `commander` for the next polish pass.

Keep `zod` or plain validators for payload/env validation where useful, but let `commander` own command parsing, help, and option definitions.

## NPX / package usage decision

Support both one-off and installed usage.

Recommended for projects:

```bash
pnpm add -D @kortyx/cli
```

Then package scripts can call:

```bash
kortyx topology push --entry src/lib/agent.ts
```

Recommended for CI:

```bash
pnpm exec kortyx topology push --entry src/lib/agent.ts
```

or from a package script:

```json
{
  "scripts": {
    "kortyx:topology": "kortyx topology push --entry src/lib/agent.ts"
  }
}
```

One-off usage should also work:

```bash
npx @kortyx/cli topology push --entry src/lib/agent.ts
```

```bash
pnpm dlx @kortyx/cli topology push --entry src/lib/agent.ts
```

Guidance:

- Docs should recommend installing `@kortyx/cli` as a devDependency for reproducible CI.
- `npx` / `pnpm dlx` should be documented as convenient one-off usage.
- The published package should expose the binary name `kortyx`.

## Final terminal UX

### Local development

Dry-run first:

```bash
kortyx topology push --entry src/lib/agent.ts --dry-run
```

Push to local Studio/API:

```bash
kortyx topology push --entry src/lib/agent.ts
```

Expected output:

```txt
Pushed 5 workflow topology snapshot(s).
- general-chat@1.0.0 hash=90b696712717 transitions=4 revision=... created=false
- canvas-creation@1.4.0 hash=2b1fa0a8f77f transitions=0 revision=... created=false
- canvas-save@1.4.0 hash=36a4a9f7661e transitions=0 revision=... created=false
- brief-query@1.0.0 hash=77a10f52db70 transitions=0 revision=... created=false
- update-canvas@2.1.0 hash=e551a1630b8f transitions=1 revision=... created=false
```

### CI/deploy

Minimal deploy command:

```bash
kortyx topology push \
  --entry src/lib/agent.ts \
  --environment production \
  --service-name my-app \
  --deployment-ref "$GITHUB_SHA"
```

With explicit API config:

```bash
kortyx topology push \
  --entry src/lib/agent.ts \
  --api-url "$KORTYX_TELEMETRY_API_URL" \
  --api-key "$KORTYX_TELEMETRY_API_KEY" \
  --environment production \
  --service-name my-app \
  --deployment-ref "$GITHUB_SHA"
```

### Sentry-style release flow

The future CLI can offer a release-oriented UX similar to Sentry, but we should keep the semantics clear:

- A release/deployment ref is code metadata.
- It is not the workflow topology version.
- The API still creates workflow topology revisions automatically from topology hashes.

Possible future commands:

```bash
kortyx releases new "$GITHUB_SHA"
kortyx topology push --entry src/lib/agent.ts --release "$GITHUB_SHA"
kortyx releases finalize "$GITHUB_SHA"
```

or a compact deploy command:

```bash
kortyx deploys new "$GITHUB_SHA" \
  --environment production \
  --service-name my-app \
  --topology-entry src/lib/agent.ts
```

Recommended near-term approach:

Do not build full release management yet. Keep `--deployment-ref` on `topology push`, because that already gives Studio a code/deploy reference without introducing a new release database model.

Add release commands later only when Studio needs a first-class Releases page.

## Command surface

CLI domains should be organized around product areas:

```bash
kortyx topology ...
kortyx studio ...
kortyx auth ...
kortyx keys ...
kortyx releases ...
```

Initial stable command:

```bash
kortyx topology push
```

Required:

```bash
--entry <path>
```

Common options:

```bash
--export <name>
--api-url <url>
--api-key <key>
--environment <name>
--service-name <name>
--deployment-ref <ref>
--dry-run
--json
```

Environment defaults:

```bash
KORTYX_TELEMETRY_API_URL
KORTYX_API_URL
KORTYX_TELEMETRY_API_KEY
KORTYX_TELEMETRY_ENVIRONMENT
KORTYX_TELEMETRY_SERVICE_NAME
KORTYX_TELEMETRY_DEPLOYMENT_REF
GITHUB_SHA
VERCEL_GIT_COMMIT_SHA
```

The CLI should load `.env` and `.env.local` from the current working directory without overriding existing env vars.

## Entry module contract

The entry module may export:

```ts
export const agent = createAgent(...)
```

or:

```ts
export default createAgent(...)
```

or:

```ts
export const workflows = [workflowA, workflowB]
```

or named workflow definitions:

```ts
export const generalChatWorkflow = defineWorkflow(...)
export const canvasSaveWorkflow = defineWorkflow(...)
```

If an export is ambiguous, users can specify:

```bash
kortyx topology push --entry src/workflows.ts --export workflows
```

## Implementation cleanup needed

The current CLI implementation works, but it should be polished:

1. Replace manual argument parsing with `commander`.
2. Keep command execution logic separate from command definition.
3. Add tests for:
   - missing required options;
   - env fallback behavior;
   - `.env.local` loading;
   - `--dry-run`;
   - named export selection;
   - agent export;
   - workflows array export;
   - TS path aliases;
   - `server-only` / `client-only` stubs;
   - failed API response.
4. Ensure binary help is clean:

```bash
kortyx --help
kortyx topology --help
kortyx topology push --help
```

5. Make output stable and parseable:
   - human output by default;
   - `--json` for CI automation.

## API semantics

The CLI should not create versions directly.

The CLI sends topology snapshots to:

```txt
POST /v1/telemetry/workflow-revisions:ensure
```

The API:

- validates the request;
- calculates/uses topology hash identity;
- creates a workflow revision only if the topology hash is new;
- returns `workflowRevisionId` and `created`.

This keeps versioning automatic in the API and avoids codebase writes for Studio metadata.

## Studio management commands

The CLI should also manage Studio setup and access. This matters for both OSS and cloud.

Primary use cases:

- initialize local/self-hosted Studio;
- create scoped API keys;
- list/revoke keys;
- configure Studio auth mode;
- manage users for OSS/basic auth where supported;
- manage LLM Studio access for hosted/cloud environments;
- inspect API connectivity and project/org identity;
- eventually manage cloud-only resources through explicit extension points.

Possible command surface:

```bash
kortyx studio init
kortyx studio doctor
kortyx studio status
kortyx studio open
```

API key management:

```bash
kortyx keys create --name ci-topology --scope telemetry:write
kortyx keys create --name studio-read --scope studio:read
kortyx keys list
kortyx keys revoke <key-id>
```

Auth/user management for OSS:

```bash
kortyx studio users create --email admin@example.com --role admin
kortyx studio users list
kortyx studio users disable <user-id>
```

LLM Studio access / cloud-oriented commands:

```bash
kortyx studio llm-access grant --user user@example.com
kortyx studio llm-access revoke --user user@example.com
kortyx studio llm-access list
```

Alternative naming if "LLM Studio" becomes a separate product area:

```bash
kortyx llm-studio access grant --user user@example.com
kortyx llm-studio access revoke --user user@example.com
kortyx llm-studio access list
```

Recommendation:

- Use `kortyx studio ...` as the parent namespace unless LLM Studio becomes a distinct product with its own API and UI.
- Keep OSS commands limited to OSS-supported auth/resources.
- Cloud-only commands should fail clearly against OSS with a message such as: "This command requires Kortyx Cloud."
- Do not hide cloud behavior inside OSS code paths. Use explicit API endpoints and extension points.

## Studio management API requirements

To support the CLI cleanly, the API should expose admin endpoints instead of letting the CLI write directly to the DB.

OSS API candidates:

```txt
POST /v1/admin/api-keys
GET  /v1/admin/api-keys
POST /v1/admin/api-keys/{id}:revoke

GET  /v1/admin/studio/status
POST /v1/admin/studio/bootstrap

POST /v1/admin/users
GET  /v1/admin/users
POST /v1/admin/users/{id}:disable
```

Cloud API candidates:

```txt
POST   /v1/admin/studio/llm-access/grants
GET    /v1/admin/studio/llm-access/grants
DELETE /v1/admin/studio/llm-access/grants/{id}
```

This keeps the CLI thin:

- parse command;
- load env/config;
- call API;
- render human or JSON output.

The CLI should not become a second backend.

## CLI auth model for Studio management

Topology push uses telemetry API keys.

Studio/admin management needs stronger admin credentials.

Recommended model:

- OSS bootstrap can use a local bootstrap secret or first-run admin token.
- Normal admin operations use scoped admin API keys.
- Cloud operations use user login/device auth or cloud admin tokens.

Possible command UX:

```bash
kortyx login
kortyx logout
kortyx whoami
```

For OSS/local:

```bash
kortyx studio bootstrap --api-url http://localhost:6400
kortyx keys create --scope telemetry:write --name local-telemetry
```

For cloud:

```bash
kortyx login
kortyx studio llm-access grant --user user@example.com
```

Do not block topology push on interactive login. CI should keep using explicit API keys.

## Documentation updates needed

Document this in:

- `packages/cli/README.md`
- Canvas example README
- Studio/telemetry setup docs
- website docs under production/observability or Studio setup

Docs should explicitly say:

- Run `kortyx topology push` in CI/deploy.
- Runtime telemetry is not the canonical way to discover the full topology.
- Runtime can still backfill observed dynamic transitions.
- Static topology depends on discoverable `transitionTo` return shapes.
- Studio/admin commands require admin credentials, not telemetry write keys.
- Cloud-only Studio/LLM access commands should be clearly marked as cloud-only when applicable.
