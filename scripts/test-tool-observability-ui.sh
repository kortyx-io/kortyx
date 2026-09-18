#!/usr/bin/env bash
set -euo pipefail
# Entirely isolated test installation; never publishes fixtures into an application project.
probe_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
probe_container="kortyx-tool-ui-test-$$"
probe_api_pid=""; probe_studio_pid=""
stop_process_tree() {
  local probe_pid="$1" probe_child
  for probe_child in $(ps -eo pid=,ppid= | awk -v parent="$probe_pid" '$2 == parent {print $1}'); do
    stop_process_tree "$probe_child"
  done
  kill "$probe_pid" 2>/dev/null || true
}
cleanup() {
  [[ -z "$probe_api_pid" ]] || stop_process_tree "$probe_api_pid"
  [[ -z "$probe_studio_pid" ]] || stop_process_tree "$probe_studio_pid"
  docker stop "$probe_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cd "$probe_root"
pnpm exec turbo run build --filter=kortyx --filter=@kortyx/telemetry --filter=@kortyx/api >/tmp/kortyx-tool-ui-build.log 2>&1
docker run --rm -d --name "$probe_container" -e POSTGRES_USER=kortyx -e POSTGRES_PASSWORD=kortyx -e POSTGRES_DB=kortyx -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
for ((probe_attempt=0; probe_attempt<30; probe_attempt++)); do
  if docker exec "$probe_container" pg_isready -U kortyx -d kortyx >/dev/null 2>&1; then break; fi
  sleep 1
done
probe_port="$(docker port "$probe_container" 5432/tcp | awk -F: '{print $NF}')"
export DATABASE_URL="postgres://kortyx:kortyx@127.0.0.1:$probe_port/kortyx"
export KORTYX_API_KEY_PEPPER="isolated-tool-e2e-pepper"
export KORTYX_TELEMETRY_API_KEY="ktyx_test_toole2etelemetry_isolated-tool-e2e-telemetry"
export KORTYX_STUDIO_API_KEY="ktyx_test_toole2estudio_isolated-tool-e2e-studio"
export KORTYX_API_URL="http://127.0.0.1:6418"
export API_PORT=6418 API_HOST=127.0.0.1 STUDIO_PORT=6318
export KORTYX_E2E_STUDIO_URL="http://localhost:6318"
pnpm --filter @kortyx/telemetry-db db:migrate > /tmp/kortyx-tool-ui-db.log 2>&1
pnpm --filter @kortyx/telemetry-db db:bootstrap >> /tmp/kortyx-tool-ui-db.log 2>&1
pnpm --filter @kortyx/api exec tsx src/index.ts > /tmp/kortyx-tool-ui-api.log 2>&1 &
probe_api_pid=$!
pnpm --filter kortyx-studio dev > /tmp/kortyx-tool-ui-studio.log 2>&1 &
probe_studio_pid=$!
for ((probe_attempt=0; probe_attempt<90; probe_attempt++)); do
  if curl -sf "$KORTYX_API_URL/health" >/dev/null && curl -sf "$KORTYX_E2E_STUDIO_URL/workflows" >/dev/null; then break; fi
  sleep 1
done
pnpm --filter kortyx-studio exec playwright test --config playwright.tools.config.ts
