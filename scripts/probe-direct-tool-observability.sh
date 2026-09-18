#!/usr/bin/env bash
set -euo pipefail

# A disposable local database avoids writing research fixtures to an app database.
probe_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
probe_container="kortyx-tool-observability-probe-$$"
trap 'docker stop "$probe_container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$probe_container" \
  -e POSTGRES_USER=kortyx -e POSTGRES_PASSWORD=kortyx -e POSTGRES_DB=kortyx \
  -p 127.0.0.1::5432 postgres:17-alpine >/dev/null

probe_ready=0
for ((probe_attempt=0; probe_attempt<30; probe_attempt++)); do
  if docker exec "$probe_container" pg_isready -U kortyx -d kortyx >/dev/null 2>&1; then
    probe_ready=1
    break
  fi
  sleep 1
done
if [[ "$probe_ready" != 1 ]]; then
  echo "The disposable probe database did not become ready." >&2
  exit 1
fi
probe_port="$(docker port "$probe_container" 5432/tcp | awk -F: '{print $NF}')"
cd "$probe_root"
KORTYX_OBSERVABILITY_PROBE_DATABASE_URL="postgres://kortyx:kortyx@127.0.0.1:$probe_port/kortyx" \
  pnpm exec vitest run --config test/observability/vitest.config.ts

# Existing projection regressions run against the same disposable, migrated database.
DATABASE_URL="postgres://kortyx:kortyx@127.0.0.1:$probe_port/kortyx" \
  pnpm --filter @kortyx/telemetry-db test:integration
