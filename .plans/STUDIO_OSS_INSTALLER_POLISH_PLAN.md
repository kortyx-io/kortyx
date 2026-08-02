# Studio OSS Installer Polish Plan

## Goal

Make Kortyx Studio OSS as easy to run as tools like Kestra or Temporal: a user should be able to install, start, verify, and update Studio with minimal Docker knowledge.

The current implementation has the foundation:

- image-based `docker-compose.oss.yml`
- generated local secrets through `scripts/install-studio-oss.sh`
- GHCR staging image publish workflow
- GHCR promotion workflow that retags tested staging images to production tags

This plan captures the next implementation layer needed before we call the self-hosted experience polished.

## Target user experience

Preferred install command:

```bash
curl -fsSL https://get.kortyx.io/studio | sh
```

Expected behavior:

- creates a local `kortyx-studio/` directory
- downloads the OSS compose file
- generates secure local secrets into `.env`
- starts Postgres, Kortyx API, and Studio in detached mode
- waits until Studio is reachable
- prints the Studio URL, username, password, telemetry API key, and update command

Expected update command:

```bash
cd kortyx-studio
docker compose -f docker-compose.oss.yml pull
docker compose -f docker-compose.oss.yml up -d
```

Future nicer update command:

```bash
curl -fsSL https://get.kortyx.io/studio | sh -s -- update
```

## Required work

### 1. Stable hosted installer URL

Create a stable URL instead of asking users to run the raw GitHub URL.

Target:

```bash
https://get.kortyx.io/studio
```

This can initially serve the same content as:

```bash
scripts/install-studio-oss.sh
```

Requirements:

- the URL must be stable across repo moves or branch changes
- the script should default to downloading artifacts from the latest production OSS release path
- advanced users should still be able to override source URLs with environment variables

### 2. Public published images

Ensure these production image tags exist and are public:

```txt
ghcr.io/kortyx-io/kortyx-api:latest
ghcr.io/kortyx-io/kortyx-studio:latest
```

Also support pinned release tags:

```txt
ghcr.io/kortyx-io/kortyx-api:vX.Y.Z
ghcr.io/kortyx-io/kortyx-studio:vX.Y.Z
```

Requirements:

- unauthenticated `docker pull` should work for OSS users
- promotion must retag the already-tested staging image digest
- promotion must not rebuild images

### 3. Print generated credentials clearly

The installer currently writes generated values into `.env`. It should also print the important generated values after install.

Output should include:

```txt
Studio URL: http://localhost:6300
Username: admin
Password: <generated password>
Telemetry API key: <generated key>
Studio API key location: ./kortyx-studio/.env
```

Security expectations:

- secrets are still persisted only in `.env`
- output should make clear that credentials must be stored safely
- if `.env` already exists, do not rotate credentials silently

### 4. Wait for readiness

After starting Docker Compose, the installer should wait until Studio is reachable.

Success output:

```txt
Studio is ready.
```

Failure output should show actionable diagnostics:

```bash
docker compose -f docker-compose.oss.yml ps
docker compose -f docker-compose.oss.yml logs api
docker compose -f docker-compose.oss.yml logs studio
docker compose -f docker-compose.oss.yml logs db-init
```

Requirements:

- bounded timeout
- useful logs on failure
- no infinite wait

### 5. Add installer commands

The install script should support subcommands.

Suggested commands:

```bash
install
update
status
logs
stop
restart
uninstall
```

Initial minimum:

```bash
install
update
status
logs
```

Behavior:

- no argument defaults to `install`
- `update` pulls latest images and restarts services
- `status` runs compose `ps`
- `logs` tails useful services

### 6. Keep no-clone install as the default path

The default OSS install path should not require:

- cloning the repository
- installing Node.js
- installing pnpm
- building Docker images locally
- manually editing `.env`

The local repo-based flow can remain for developers:

```bash
cp .env.example .env
docker compose up --build
```

### 7. Add a public smoke-test instruction

For users:

```bash
cd kortyx-studio
docker compose -f docker-compose.oss.yml --profile smoke up \
  --abort-on-container-exit \
  --exit-code-from smoke \
  smoke
```

For maintainers, the GHCR staging workflow should continue running this against `staging-vX.Y.Z` before promotion.

### 8. Optional future UX

Consider eventually shipping a tiny CLI wrapper:

```bash
kortyx-studio install
kortyx-studio update
kortyx-studio logs
```

Do not make this required for the first polished OSS installer. A shell installer plus Docker Compose is enough.

## Definition of done

This installer polish is done when:

- `curl -fsSL https://get.kortyx.io/studio | sh` installs and starts Studio from public images
- the script prints generated credentials and URLs
- the script waits for Studio readiness
- users can update with a documented command
- users can run the smoke test without cloning the repo
- GHCR staging images are tested before promotion
- production tags point to the tested staging image digests
