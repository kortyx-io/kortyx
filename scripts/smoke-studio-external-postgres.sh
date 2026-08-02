#!/bin/sh

set -eu

: "${KORTYX_API_IMAGE:?KORTYX_API_IMAGE is required}"
: "${KORTYX_STUDIO_IMAGE:?KORTYX_STUDIO_IMAGE is required}"
: "${KORTYX_STUDIO_IMAGE_TAG:?KORTYX_STUDIO_IMAGE_TAG is required}"

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$repository_root/deploy/studio/compose.external-postgres.yml"
smoke_id=${KORTYX_SMOKE_ID:-"$$"}
project_name="kortyx-external-smoke-$smoke_id"
network_name="$project_name-network"
postgres_container="$project_name-postgres"
state_dir=$(mktemp -d "${TMPDIR:-/tmp}/kortyx-external-smoke.XXXXXX")
env_file="$state_dir/deployment.env"
postgres_password=$(openssl rand -hex 24)
pepper=$(openssl rand -hex 32)
telemetry_key="ktyx_live_smoketelemetry$(openssl rand -hex 4)_$(openssl rand -hex 32)"
studio_key="ktyx_live_smokestudio$(openssl rand -hex 4)_$(openssl rand -hex 32)"
browser_password=$(openssl rand -hex 24)
run_id="external-postgres-smoke-$smoke_id"
rotated_run_id="$run_id-after-rotation"
api_port=${KORTYX_SMOKE_API_PORT:-26400}
studio_port=${KORTYX_SMOKE_STUDIO_PORT:-26300}

cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    echo "External PostgreSQL smoke failed; final service state:" >&2
    docker compose --env-file "$env_file" -f "$compose_file" ps >&2 || true
    docker compose --env-file "$env_file" -f "$compose_file" logs --tail 200 >&2 || true
  fi
  docker compose --env-file "$env_file" -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$postgres_container" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
  rm -rf "$state_dir"
  exit "$result"
}
trap cleanup EXIT INT TERM

run_bootstrap_without_secret_output() {
  bootstrap_output=$(docker compose --env-file "$env_file" -f "$compose_file" run --rm db-init)
  if printf '%s' "$bootstrap_output" | grep -F "$telemetry_key" >/dev/null || \
    printf '%s' "$bootstrap_output" | grep -F "$studio_key" >/dev/null; then
    echo "Database bootstrap exposed an operator-provided API key." >&2
    exit 1
  fi
  printf '%s\n' "$bootstrap_output"
}

chmod 700 "$state_dir"
cat >"$env_file" <<EOF
KORTYX_API_IMAGE=$KORTYX_API_IMAGE
KORTYX_STUDIO_IMAGE=$KORTYX_STUDIO_IMAGE
KORTYX_STUDIO_IMAGE_TAG=$KORTYX_STUDIO_IMAGE_TAG
KORTYX_COMPOSE_PROJECT_NAME=$project_name
KORTYX_STUDIO_NETWORK=$network_name
KORTYX_STUDIO_NETWORK_EXTERNAL=true
DATABASE_URL=postgresql://kortyx:$postgres_password@$postgres_container:5432/kortyx
KORTYX_API_KEY_PEPPER=$pepper
KORTYX_TELEMETRY_API_KEY=$telemetry_key
KORTYX_STUDIO_API_KEY=$studio_key
KORTYX_STUDIO_BASIC_AUTH_USERNAME=admin
KORTYX_STUDIO_BASIC_AUTH_PASSWORD=$browser_password
KORTYX_API_BIND_ADDRESS=127.0.0.1
KORTYX_STUDIO_BIND_ADDRESS=127.0.0.1
API_PORT=$api_port
STUDIO_PORT=$studio_port
EOF
chmod 600 "$env_file"

docker network create "$network_name" >/dev/null
docker run --detach --name "$postgres_container" --network "$network_name" \
  -e POSTGRES_USER=kortyx \
  -e POSTGRES_PASSWORD="$postgres_password" \
  -e POSTGRES_DB=kortyx \
  --health-cmd="pg_isready -U kortyx -d kortyx" \
  --health-interval=2s \
  --health-timeout=5s \
  --health-retries=30 \
  postgres:17-alpine >/dev/null

until [ "$(docker inspect --format '{{.State.Health.Status}}' "$postgres_container")" = "healthy" ]; do
  sleep 1
done

docker compose --env-file "$env_file" -f "$compose_file" up \
  --detach --wait --wait-timeout 180

docker run --rm --network "$network_name" \
  -e KORTYX_API_URL=http://api:6400 \
  -e KORTYX_TELEMETRY_API_KEY="$telemetry_key" \
  -e KORTYX_STUDIO_API_KEY="$studio_key" \
  -e KORTYX_SMOKE_RUN_ID="$run_id" \
  "$KORTYX_API_IMAGE:$KORTYX_STUDIO_IMAGE_TAG" \
  pnpm --filter @kortyx/api smoke:telemetry

docker run --rm --network "$network_name" \
  -e KORTYX_EXPECTED_RUN_ID="$run_id" \
  -e KORTYX_STUDIO_API_KEY="$studio_key" \
  "$KORTYX_API_IMAGE:$KORTYX_STUDIO_IMAGE_TAG" \
  node -e '
    const endpoint = "http://api:6400/v1/studio/runs";
    const request = (key) => fetch(endpoint, {
      headers: { authorization: `Bearer ${key}` },
    });
    const valid = await request(process.env.KORTYX_STUDIO_API_KEY);
    if (!valid.ok) throw new Error(`Studio key failed with ${valid.status}: ${await valid.text()}`);
    const { runs } = await valid.json();
    if (!runs.some(({ id }) => id === process.env.KORTYX_EXPECTED_RUN_ID)) {
      throw new Error(`Persisted smoke run ${process.env.KORTYX_EXPECTED_RUN_ID} was not found.`);
    }
    const invalid = await request("ktyx_live_unknown_invalid");
    if (invalid.status !== 401) throw new Error(`Invalid key returned ${invalid.status}, expected 401.`);
    console.log("Verified external PostgreSQL persistence and API authentication.");
  '

# A deployment job may be retried. Both operations must remain idempotent, and
# operator-provided raw API keys must never be repeated in deployment logs.
run_bootstrap_without_secret_output
docker compose --env-file "$env_file" -f "$compose_file" restart api studio
docker compose --env-file "$env_file" -f "$compose_file" up \
  --detach --wait --wait-timeout 180 api studio

curl --fail --silent --show-error "http://127.0.0.1:$api_port/health" >/dev/null
curl --fail --silent --show-error \
  --user "admin:$browser_password" \
  "http://127.0.0.1:$studio_port" >/dev/null

# The initial remote rotation contract replaces each verifier under its
# existing key ID. Prove the previous secrets are rejected, the replacements
# work, and data written before rotation remains readable.
old_telemetry_key=$telemetry_key
old_studio_key=$studio_key
telemetry_key="${telemetry_key%_*}_$(openssl rand -hex 32)"
studio_key="${studio_key%_*}_$(openssl rand -hex 32)"
rotated_env_file="$state_dir/deployment.rotated.env"
awk \
  -v telemetry_key="$telemetry_key" \
  -v studio_key="$studio_key" \
  'BEGIN { FS = OFS = "=" }
   $1 == "KORTYX_TELEMETRY_API_KEY" { $2 = telemetry_key }
   $1 == "KORTYX_STUDIO_API_KEY" { $2 = studio_key }
   { print }' \
  "$env_file" >"$rotated_env_file"
chmod 600 "$rotated_env_file"
mv "$rotated_env_file" "$env_file"

run_bootstrap_without_secret_output
docker compose --env-file "$env_file" -f "$compose_file" up \
  --detach --force-recreate --wait --wait-timeout 180 api studio

docker run --rm --network "$network_name" \
  -e KORTYX_OLD_TELEMETRY_API_KEY="$old_telemetry_key" \
  -e KORTYX_OLD_STUDIO_API_KEY="$old_studio_key" \
  -e KORTYX_STUDIO_API_KEY="$studio_key" \
  -e KORTYX_EXPECTED_RUN_ID="$run_id" \
  "$KORTYX_API_IMAGE:$KORTYX_STUDIO_IMAGE_TAG" \
  node -e '
    const request = (path, key, init = {}) => fetch(`http://api:6400${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    const oldStudio = await request("/v1/studio/runs", process.env.KORTYX_OLD_STUDIO_API_KEY);
    if (oldStudio.status !== 401) throw new Error(`Previous Studio key returned ${oldStudio.status}, expected 401.`);
    const oldTelemetry = await request(
      "/v1/telemetry/events:batch",
      process.env.KORTYX_OLD_TELEMETRY_API_KEY,
      { method: "POST", body: JSON.stringify({ events: [] }) },
    );
    if (oldTelemetry.status !== 401) throw new Error(`Previous telemetry key returned ${oldTelemetry.status}, expected 401.`);
    const current = await request("/v1/studio/runs", process.env.KORTYX_STUDIO_API_KEY);
    if (!current.ok) throw new Error(`Rotated Studio key failed with ${current.status}: ${await current.text()}`);
    const { runs } = await current.json();
    if (!runs.some(({ id }) => id === process.env.KORTYX_EXPECTED_RUN_ID)) {
      throw new Error(`Pre-rotation run ${process.env.KORTYX_EXPECTED_RUN_ID} was not found.`);
    }
    console.log("Verified old keys were revoked and pre-rotation data remained readable.");
  '

docker run --rm --network "$network_name" \
  -e KORTYX_API_URL=http://api:6400 \
  -e KORTYX_TELEMETRY_API_KEY="$telemetry_key" \
  -e KORTYX_STUDIO_API_KEY="$studio_key" \
  -e KORTYX_SMOKE_RUN_ID="$rotated_run_id" \
  "$KORTYX_API_IMAGE:$KORTYX_STUDIO_IMAGE_TAG" \
  pnpm --filter @kortyx/api smoke:telemetry

studio_runs_html=$(curl --fail --silent --show-error \
  --user "admin:$browser_password" \
  "http://127.0.0.1:$studio_port/runs")
if ! printf '%s' "$studio_runs_html" | grep -F "$rotated_run_id" >/dev/null; then
  echo "Studio did not render telemetry using the rotated read key." >&2
  exit 1
fi

echo "External PostgreSQL deployment smoke passed."
