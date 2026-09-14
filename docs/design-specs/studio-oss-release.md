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

The `Publish Release (Studio)` GitHub Actions workflow is the only
production publication path. It is started manually after npm publication;
creating a `studio-vX.Y.Z` tag does not start Docker publication.

1. **Validate:** derive the version from the release-please `studio-vX.Y.Z` tag,
   require it to match Studio's package and release manifest, and verify the
   tagged commit is on `main`.
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
4. Allow deployments from `main`. Run the workflow from `main` and supply the
   existing `studio-vX.Y.Z` tag in `release_tag`. The workflow checks out that
   tag, verifies its commit is on `main`, then pins every remaining job to the
   same SHA. The environment policy applies to the selected workflow ref
   (`main`), not the `release_tag` input.

The workflow contains the environment gate, but GitHub only pauses for approval
when the repository environment has a protection rule.

## Release operation

1. Merge Studio changes to `main` using conventional commit messages, as for
   the other release-please packages.
2. Run **Prepare Release PR (Repo)** and merge the shared release PR. It updates
   `apps/studio/package.json`, `apps/studio/CHANGELOG.md`, and Studio's entry in
   `.github/release-please/manifest.json` together.
3. Wait for **Create Release Tags (Repo)** to create `studio-vX.Y.Z`.
4. Run **Publish Release (NPM Packages)** for the release commit and wait for it
   to succeed. The Studio installer depends on those published npm versions.
5. Run **Publish Release (Studio)** with **Use workflow from:
   main** and `release_tag` set to `studio-vX.Y.Z`.
6. Wait for both native clean-install jobs to pass, then review the staged
   version and approve the `studio-production` deployment.
7. Confirm the workflow summary lists the promoted API and Studio digests.

The workflow publishes:

```text
ghcr.io/kortyx-io/kortyx-api:vX.Y.Z
ghcr.io/kortyx-io/kortyx-api:latest
ghcr.io/kortyx-io/kortyx-studio:vX.Y.Z
ghcr.io/kortyx-io/kortyx-studio:latest
```

Release-please owns the Git tag and GitHub release. The image workflow never
creates a second tag or accepts an independently entered version. The GitHub
release can exist before image approval; the image workflow summary confirms
when production images have been promoted. The native smoke tests also verify
that the Studio package version inside the image matches its release tag.

The Studio menu displays the version from `apps/studio/package.json` included
in the running build. It does not check for newer releases.

## Failure and recovery

- A staging failure never changes a production tag.
- A smoke failure prints container state and logs, then removes its isolated
  database volume.
- Rejecting the environment deployment leaves only staging tags.
- To retry, prefer **Re-run failed jobs**. If npm dependencies were missing,
  complete npm publication first. To use updated workflow code for an older
  release, choose **Run workflow** from `main` and supply its existing
  `studio-vX.Y.Z` tag in `release_tag`. Re-running is safe until a production
  image tag exists; the release-please Git tag is expected to exist.
- If promotion partially succeeds, inspect the recorded digests before any
  manual recovery. Never rebuild under the same version.

Versioned tags are the reproducible choice for long-lived installations:

```bash
npx kortyx studio start --image-tag vX.Y.Z
```

Running the same command with a newer versioned tag performs a pull and retains
the local database and credentials.
