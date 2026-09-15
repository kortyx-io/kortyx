---
id: v0-studio-high-availability
title: "Run Kortyx Studio with Multiple Replicas"
description: "Deploy highly available Kortyx Studio replicas with serialized migrations, readiness, graceful draining, and safe rolling updates."
keywords: [kortyx, studio, high availability, replicas, rolling deployment, ecs, kubernetes, cloud run]
sidebar_label: "High Availability"
---
# Run Kortyx Studio with Multiple Replicas

Kortyx Studio supports two or more API and Studio replicas behind a load balancer. This is the recommended production topology when brief application interruptions are unacceptable. Replica support is part of the self-hosted distribution and is not gated by a paid feature flag.

High availability is an infrastructure property, not a replica-count switch in Studio. Your orchestrator must spread replicas across failure domains, run database work once per release, use the correct health endpoints, and honor the release's deployment strategy.

> **CDK boundary:** The convenience `@kortyx/aws-cdk` construct remains a single-task deployment. For highly available AWS, implement this contract with your own ECS or EKS resources rather than placing a second copy of the construct beside the first.

## Production baseline

```text
                              +--> Studio replica A --+
users ---- HTTPS load balancer+                       +--> API service
                              +--> Studio replica B --+      |
                                                            v
SDKs ----- HTTPS load balancer+--> API replica A ------> shared PostgreSQL
                              `--> API replica B ------> shared PostgreSQL

release workflow --> one-shot migrate/bootstrap job --> shared PostgreSQL
```

Use this baseline:

- at least two API replicas and two Studio replicas;
- replicas spread across at least two zones, nodes, or equivalent failure domains;
- one shared PostgreSQL database and identical secret values for every replica;
- one retryable `kortyx-studio-db migrate-and-bootstrap` job per deployment;
- load-balancer routing based on API readiness, with no sticky sessions required; and
- update scheduling owned by the infrastructure repository, with the local Docker updater disabled.

The API has no durable local state. PostgreSQL stores application state and distributes live Studio invalidations to every API replica through `LISTEN`/`NOTIFY`. Kortyx tests the two-replica delivery path and concurrent migration runners against real PostgreSQL in CI.

## Health and termination contract

| Endpoint | Meaning | Orchestrator use |
| --- | --- | --- |
| `GET /live` | The API process is alive | Container liveness/restart probe |
| `GET /ready` | The API accepts traffic and can reach PostgreSQL | Load-balancer or readiness probe |
| `GET /health` | Backwards-compatible liveness alias | Existing installations only |

All API health endpoints are unauthenticated. Keep them inside the deployment network or expose only the minimum path needed by the load balancer.

On `SIGTERM`, the API becomes unready, stops accepting new HTTP connections, waits up to 25 seconds for requests to drain, and then closes its PostgreSQL listener and pool. Set the platform termination grace period above 25 seconds. The Studio container is healthy when its root path returns any status below `500`; `401` is expected when Basic Auth is active.

Replica redundancy preserves capacity for new traffic after the load balancer withdraws a failed target. It cannot finish a request that was already executing inside a process when that process is hard-killed. Clients should retry transient network and `5xx` failures. Telemetry writes are safe to retry with the same stable event IDs because ingestion deduplicates those IDs per project.

## Run database work once

Application replicas must not run migrations in their normal startup command. Schedule the API image as a separate one-shot job before a release:

```bash
kortyx-studio-db migrate-and-bootstrap
```

The job is idempotent and can be retried. Migrations hold a PostgreSQL advisory lock for the complete migration set, so accidentally concurrent jobs serialize instead of racing. The lock is a safety net; keep one job as the normal orchestration model.

Do not start new application images until this job succeeds. Database downgrade is unsupported, so take a provider snapshot or verified backup before changing the schema.

## Choose the deployment path from the release

The stable release manifest is available at `https://updates.kortyx.io/studio/stable.json`. It contains immutable API and Studio image digests and a deployment marker:

```json
{
  "format": 1,
  "installer": 1,
  "version": "0.5.0",
  "api": "ghcr.io/kortyx-io/kortyx-api@sha256:...",
  "studio": "ghcr.io/kortyx-io/kortyx-studio@sha256:...",
  "deployment": { "strategy": "rolling" }
}
```

Treat a missing or unknown deployment marker as `recreate`.

### `rolling`

The release is explicitly compatible with overlapping old and new application replicas during its migration and rollout. After the database job succeeds:

1. start new replicas without stopping the old replicas;
2. wait for their readiness checks;
3. move traffic to healthy new replicas;
4. terminate old replicas gracefully; and
5. fail or roll back the application rollout if readiness never succeeds.

Use the rolling path only for the upgrade path reviewed by the release. Treat a skipped, unknown, or locally modified version as `recreate` unless you have independently verified compatibility.

### `recreate`

The release cannot promise safe version overlap. Schedule a maintenance window:

1. stop API ingestion and Studio replicas;
2. back up PostgreSQL;
3. run the database job;
4. start the new API replicas and wait for `/ready`;
5. start the new Studio replicas; and
6. verify authenticated reads and a telemetry write before ending maintenance.

This path can interrupt Studio and telemetry ingestion even when the normal replica count is two. Telemetry producers should retry important writes.

## Platform mapping

| Contract | ECS | Kubernetes | Google Cloud |
| --- | --- | --- | --- |
| Application replicas | Two or more tasks per service, spread across Availability Zones | `replicas: 2` or more with topology spread | Cloud Run or GKE with at least two warm instances/pods |
| API traffic health | Target group uses `/ready` | Readiness probe uses `/ready` | Service or load-balancer health uses `/ready` where configurable |
| Process restart health | Container check uses `/live` | Liveness probe uses `/live` | Platform instance health |
| Database operation | One-off ECS task | Job or controlled Helm hook | Cloud Run Job or GKE Job |
| Rolling availability | Minimum healthy 100%, capacity above 100% | `maxUnavailable: 0`, `maxSurge: 1` | Revision traffic migration or rolling GKE Deployment |
| Failure-domain protection | Availability Zone placement | topology spread plus PodDisruptionBudget | Regional service or multi-zone GKE placement |

For ECS, use separate long-running services or another topology where a new task does not rerun migrations as a sidecar. For Kubernetes, keep the migration Job outside the Deployment. For Cloud Run, run database work as a Cloud Run Job before updating service revisions.

## Automate release discovery with GitHub Actions

Managed installations should not mount a Docker socket or let every replica update itself. A scheduled GitHub Actions workflow can check the Kortyx release manifest and open a normal infrastructure pull request. Store the selected manifest in your repository, for example at `infra/kortyx-studio-release.json`, and make the deployment code read its version or image digests.

For the CDK convenience construct, read the reviewed file and restore the `v` prefix expected by its version property:

```ts
import { readFileSync } from "node:fs";

const release = JSON.parse(
  readFileSync("infra/kortyx-studio-release.json", "utf8"),
) as { version: string };

new KortyxStudio(this, "Studio", {
  vpc,
  domainName: "studio.example.com",
  version: `v${release.version}`,
});
```

```yaml
name: Check Kortyx Studio release

on:
  schedule:
    - cron: "17 7 * * *"
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  propose:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Read and validate the stable release
        env:
          RELEASE_FILE: infra/kortyx-studio-release.json
        run: |
          set -euo pipefail
          curl --fail --silent --show-error --location \
            https://updates.kortyx.io/studio/stable.json \
            --output "$RUNNER_TEMP/kortyx-release.json"
          jq -e '
            .format == 1 and
            .installer == 1 and
            (.version | test("^[0-9]+\\.[0-9]+\\.[0-9]+$")) and
            (.api | test("^ghcr.io/kortyx-io/kortyx-api@sha256:[a-f0-9]{64}$")) and
            (.studio | test("^ghcr.io/kortyx-io/kortyx-studio@sha256:[a-f0-9]{64}$")) and
            ((.deployment.strategy // "recreate") | IN("rolling", "recreate"))
          ' "$RUNNER_TEMP/kortyx-release.json" >/dev/null
          mkdir -p "$(dirname "$RELEASE_FILE")"
          jq -S '.deployment //= {"strategy":"recreate"}' \
            "$RUNNER_TEMP/kortyx-release.json" > "$RELEASE_FILE"
      - name: Open an infrastructure pull request
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          test -n "$(git status --porcelain -- infra/kortyx-studio-release.json)" || exit 0
          version="$(jq -r .version infra/kortyx-studio-release.json)"
          branch="deps/kortyx-studio-v${version}"
          test "$(gh pr list --head "$branch" --state open --json number --jq length)" = "0" || exit 0
          git config user.name github-actions[bot]
          git config user.email 41898282+github-actions[bot]@users.noreply.github.com
          git switch -c "$branch"
          git add infra/kortyx-studio-release.json
          git commit -m "chore: update Kortyx Studio to v${version}"
          git push --set-upstream origin "$branch"
          gh pr create \
            --title "chore: update Kortyx Studio to v${version}" \
            --body "Review the release deployment strategy, database backup, and infrastructure diff before merging." \
            --base main \
            --head "$branch"
```

Enable **Allow GitHub Actions to create and approve pull requests** in the repository Actions settings, or replace `GITHUB_TOKEN` with a narrowly scoped GitHub App token.

Protect the deployment environment so `recreate` releases require maintenance approval. For `rolling` releases, the merge workflow may run the database job and rolling rollout automatically. This is the same ownership model used by modern managed container platforms: the control plane coordinates one rollout; individual replicas never compete to replace themselves.

## What this does and does not guarantee

With the baseline above, Kortyx supports continued application service during one replica or task failure and during releases explicitly marked `rolling`. It does not by itself make PostgreSQL highly available. Use your provider's Multi-AZ, regional, backup, restore, and failover features, and test them.

This contract does not claim multi-region active-active operation, unlimited horizontal scaling, or published capacity limits. Start with two replicas, measure load and database connections, then scale for your workload.
