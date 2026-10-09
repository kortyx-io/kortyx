# Release performance

The baseline is [Studio 0.17.0's release](https://github.com/kortyx-io/kortyx/actions/runs/37909636004),
after [the release commit's CI](https://github.com/kortyx-io/kortyx/actions/runs/37908504420)
on 2026-10-09. CI took 10m 36s and the release took approximately 31 minutes.

| Baseline stage | Measured time |
| --- | --- |
| Build, publish and verify npm packages | 6m 53s |
| API image job, both architectures on one Intel runner | 14m 42s |
| Studio image job, both architectures on one Intel runner | 12m 1s |
| Clean install and upgrade, Intel | 6m 31s |
| Clean install and upgrade, ARM | 5m 35s |

The API compile layer took 549.4s under ARM emulation versus 55.4s on Intel.
The Studio compile layer took 493.3s versus 56.9s. These layers overlap between
jobs, so their savings must not be added together. The slowest CI browser shard
also spent 3m 52s downloading 21.5 MB of OS packages from an Ubuntu mirror.

## Changes

- Build API and Studio separately on native `ubuntu-24.04` and
  `ubuntu-24.04-arm` runners. Each image/architecture has its own build cache.
  Publish platform images by digest, collect this run's digests as artifacts,
  then assemble and verify the two staging indexes. Attest platform images and
  final indexes. Production promotion still uses the exact tested index digests.
- Start image builds alongside npm publication after the release tags and storage
  preflight succeed. Installation tests and production promotion depend on both
  successful npm verification and successful image assembly. Standalone recovery
  can still build images before running its existing tests.
- Use the publication helper's package selection for the npm build. Turbo's
  `package...` filters include dependencies but exclude downstream applications
  and examples. Those applications retain their CI and image-build checks.
- Run browser shards in the official Playwright image pinned by version and
  digest. Verify the installed Playwright version and browser executable before
  testing. Use the PostgreSQL service hostname inside the container network.
  Update the image version/digest with the Playwright lockfile entry. Keep the
  same tests, shards, single worker per shard and retry policy. Changes to the
  browser workflow and setup actions also trigger browser coverage, even when
  Turbo reports no affected applications.

The goal is a roughly 15–20 minute release phase. This is an estimate based on
removing emulation and overlapping independent work, not a measured guarantee.
Measure the next real release; runner queue times, cold caches and npm propagation
remain variable. Compare both elapsed time and total runner usage. Additional
parallel jobs can increase peak concurrency even when overall work decreases.

## Documentation and reported experience

- [Docker: multi-platform builds](https://docs.docker.com/build/building/multi-platform/)
  explains why compilation and compression are slower under QEMU and describes
  native multi-node builds.
- [Docker: multi-platform GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/)
  describes distributing builds across runners and assembling image indexes.
- [Docker build-push-action issue #1348](https://github.com/docker/build-push-action/issues/1348)
  reports seconds on AMD64 versus nearly twenty minutes on ARM with emulation.
  This is corroborating experience, not a benchmark for our application.
- [Playwright CI](https://playwright.dev/docs/ci) and
  [Docker guidance](https://playwright.dev/docs/docker) document the official
  image, matching package/image versions and Chromium shared-memory configuration.
- [Playwright issue #23388](https://github.com/microsoft/playwright/issues/23388)
  includes maintainer advice to use the container and a user's reported 2.5-minute
  improvement. The discussion also notes image startup cost and differences
  between host-installed tools and container contents.
- [Playwright issue #14434](https://github.com/microsoft/playwright/issues/14434)
  documents variable OS dependency installation time. Our observed delay was
  mirror download throughput, not the `man-db` trigger reported by some users.
- [Turbo filtering](https://turborepo.dev/docs/reference/run#--filter-string)
  documents selecting packages with their dependencies.
- [GitHub PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
  documents using service names and container ports for container jobs.
