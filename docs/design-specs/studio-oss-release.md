# Studio self-hosted image release

## Supported platforms

The source-available Kortyx Studio self-hosted preview publishes Linux
container images for:

- `linux/amd64` for standard Linux servers and Intel/AMD development machines.
- `linux/arm64` for Apple Silicon Docker Desktop and ARM64 Linux machines.

Docker Desktop runs these Linux containers inside its managed Linux virtual
machine. Windows containers are not supported. Other architectures may run
through user-configured emulation, but they are not release-tested.

Each public API and Studio tag is an OCI image index containing both supported
platform manifests. Docker selects the native manifest automatically.

## One release, four gates

The `Release Studio Self-Hosted Images (GHCR)` GitHub Actions workflow is the only
production publication path.

1. **Validate:** verify the manually supplied semantic version is new.
2. **Stage:** build and push API and Studio indexes for `linux/amd64` and
   `linux/arm64`, recording the immutable index digests.
3. **Accept:** install the packed `kortyx` CLI in an empty directory on native
   AMD64 and ARM64 GitHub runners. Each runner starts the staged stack, ingests
   and reads a known telemetry run, exercises documented lifecycle and
   credential commands, backs up and restores Postgres, verifies persistence
   and stable credentials, and captures Compose diagnostics on failure.
4. **Promote:** after GitHub environment approval, copy the exact accepted
   digests to `vX.Y.Z` and `latest`. Promotion never rebuilds an image.

The release is globally serialized so two versions cannot race to update
`latest`. Existing production versions and Git tags are treated as immutable.

## Required repository setup

Create a GitHub Actions environment named `studio-production` and configure at
least one required reviewer:

1. Open **Settings → Environments** in the GitHub repository.
2. Create or select `studio-production`.
3. Enable **Required reviewers** and select the release approver(s).
4. Restrict deployment branches to `main`.

The workflow contains the environment gate, but GitHub only pauses for approval
when the repository environment has a protection rule.

## Release operation

1. Merge the intended Studio release commit to `main`.
2. Open **Actions → Release Studio Self-Hosted Images (GHCR)**.
3. Choose **Run workflow**, enter the version without `v`, and keep Git tag
   creation enabled unless this is a recovery run.
4. Wait for both native clean-install jobs to pass.
5. Review the staged version and approve the `studio-production` deployment.
6. Confirm the workflow summary lists the promoted API and Studio digests.

The workflow publishes:

```text
ghcr.io/kortyx-io/kortyx-api:vX.Y.Z
ghcr.io/kortyx-io/kortyx-api:latest
ghcr.io/kortyx-io/kortyx-studio:vX.Y.Z
ghcr.io/kortyx-io/kortyx-studio:latest
```

It also creates `studio-vX.Y.Z` when requested.

## Failure and recovery

- A staging failure never changes a production tag.
- A smoke failure prints container state and logs, then removes its isolated
  database volume.
- Rejecting the environment deployment leaves only staging tags.
- Re-running the same version is safe until a production tag or release Git tag
  exists.
- If promotion partially succeeds, inspect the recorded digests before any
  manual recovery. Never rebuild under the same version.

Versioned tags are the reproducible choice for long-lived installations:

```bash
npx kortyx studio start --image-tag vX.Y.Z
```

Running the same command with a newer versioned tag performs a pull and retains
the local database and credentials.
