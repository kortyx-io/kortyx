#!/usr/bin/env bash
set -euo pipefail

# Exercise real images and the saved Compose command, not a replacement migrator.
: "${STUDIO_SMOKE_CLI:?STUDIO_SMOKE_CLI is required}"
state_dir=$(mktemp -d "$RUNNER_TEMP/kortyx-upgrade-smoke.XXXXXX")
studio_home="$state_dir/home"
previous_alias="upgrade-smoke-${ARCH_ID}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
project="kortyx-upgrade-${ARCH_ID}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
compose() { docker compose --env-file "$studio_home/.env" -f "$studio_home/compose.yml" "$@"; }
cleanup() {
  result=$?
  if [ -f "$studio_home/compose.yml" ]; then
    if [ "$result" -ne 0 ]; then compose logs --no-color --tail 100 || true; fi
    compose down --volumes --remove-orphans || true
  fi
  # Only disposable generated CI state, including root-owned updater state.
  if [ "${STUDIO_SMOKE_KEEP_STATE:-0}" = 1 ]; then
    echo "Retained disposable upgrade evidence at $state_dir"
  elif [ "$(uname -s)" = Linux ]; then
    sudo rm -rf -- "$state_dir"
  else
    rm -rf -- "$state_dir"
  fi
  exit "$result"
}
trap cleanup EXIT

code=$(curl --silent --show-error --max-time 30 --output "$state_dir/previous.json" \
  --write-out '%{http_code}' https://updates.kortyx.io/studio/stable.json)
if [ "$code" = 404 ]; then
  echo "No previous stable release exists; clean-install tests cover the first release."
  exit 0
fi
test "$code" = 200
previous_version=$(jq -er '.version | select(test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))' "$state_dir/previous.json")
if [ "$previous_version" = "$VERSION" ]; then
  echo "This version is already stable; there is no previous-to-new upgrade to test."
  exit 0
fi
previous_api=$(jq -er --arg prefix "${REGISTRY}/${API_IMAGE_NAME}@sha256:" \
  '.api | select(startswith($prefix)) | select(test("@sha256:[a-f0-9]{64}$"))' "$state_dir/previous.json")
previous_studio=$(jq -er --arg prefix "${REGISTRY}/${STUDIO_IMAGE_NAME}@sha256:" \
  '.studio | select(startswith($prefix)) | select(test("@sha256:[a-f0-9]{64}$"))' "$state_dir/previous.json")
docker pull "$previous_api"
docker pull "$previous_studio"
docker tag "$previous_api" "${REGISTRY}/${API_IMAGE_NAME}:$previous_alias"
docker tag "$previous_studio" "${REGISTRY}/${STUDIO_IMAGE_NAME}:$previous_alias"

KORTYX_STUDIO_PULL_POLICY=never "$STUDIO_SMOKE_CLI" studio start \
  --home "$studio_home" --project-name "$project" --image-tag "$previous_alias" \
  --api-port "${KORTYX_UPGRADE_SMOKE_API_PORT:-36400}" \
  --studio-port "${KORTYX_UPGRADE_SMOKE_STUDIO_PORT:-36300}" > "$state_dir/previous-start.log" 2>&1
# Protocol 1 preserves the generated Compose file. Exercise the oldest supported
# shape, before per-service users were added, so a new image cannot strand the
# updater without Docker-socket access after an otherwise successful upgrade.
sed -e '/^    user: "1000:1000"$/d' -e '/^    user: "0:0"$/d' \
  "$studio_home/compose.yml" > "$state_dir/legacy-compose.yml"
chmod 0600 "$state_dir/legacy-compose.yml"
mv "$state_dir/legacy-compose.yml" "$studio_home/compose.yml"
run_id="upgrade-smoke-${VERSION}-${ARCH_ID}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
docker run --rm --network "${project}_default" --env-file "$studio_home/.env" \
  -e KORTYX_API_URL=http://api:6400 -e KORTYX_SMOKE_RUN_ID="$run_id" \
  "$previous_api" pnpm --filter @kortyx/api smoke:telemetry
compose stop api studio
compose exec -T postgres pg_dump -U kortyx -d kortyx -Fc > "$state_dir/before.dump"
test -s "$state_dir/before.dump"

# Fingerprint persisted rows and physical identities. Never emit raw key material.
snapshot() {
  compose exec -T postgres psql -U kortyx -d kortyx -At -c "
    SELECT jsonb_build_object(
      'events', (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) FROM telemetry_events t),
      'runs', (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) FROM studio_runs t),
      'sessions', (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) FROM studio_sessions t),
      'keys', (SELECT md5(coalesce(jsonb_agg(jsonb_build_array(id, secret_hash, scopes, organization_id, project_id) ORDER BY id)::text, '[]')) FROM api_keys),
      'oids', (SELECT jsonb_object_agg(c.relname, c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname IN ('organizations', 'projects', 'api_keys', 'telemetry_events', 'studio_runs', 'studio_sessions')));"
}
snapshot > "$state_dir/before.json"
cp "$studio_home/.env" "$state_dir/before.env"
cp "$studio_home/compose.yml" "$state_dir/before-compose.yml"
# Change only the image tag. Do not regenerate the saved Compose or rotate keys.
sed "s/^KORTYX_STUDIO_IMAGE_TAG=.*/KORTYX_STUDIO_IMAGE_TAG=staging-v${VERSION}/" \
  "$state_dir/before.env" > "$studio_home/.env"
compose up -d --pull never --wait --wait-timeout 180
process_uid() {
  compose exec -T "$1" node -e '
    const status = require("node:fs").readFileSync("/proc/1/status", "utf8");
    process.stdout.write(/^Uid:\s+(\d+)/m.exec(status)[1]);
  '
}
test "$(process_uid api)" = 1000
test "$(process_uid updater)" = 0
test "$(compose exec -T updater docker compose --env-file "$studio_home/.env" \
  -f "$studio_home/compose.yml" exec -T studio node -p \
  'require("/app/apps/studio/package.json").version')" = "$VERSION"
snapshot > "$state_dir/after.json"
cmp "$state_dir/before.json" "$state_dir/after.json"
cmp "$state_dir/before-compose.yml" "$studio_home/compose.yml"
test "$(sed '/^KORTYX_STUDIO_IMAGE_TAG=/d' "$state_dir/before.env" | sha256sum)" = \
  "$(sed '/^KORTYX_STUDIO_IMAGE_TAG=/d' "$studio_home/.env" | sha256sum)"
compose run --rm --pull never db-init
compose restart api studio
compose up -d --pull never --wait --wait-timeout 180 api studio
snapshot > "$state_dir/retry.json"
cmp "$state_dir/before.json" "$state_dir/retry.json"

docker run --rm --network "${project}_default" --env-file "$studio_home/.env" \
  -e KORTYX_EXPECTED_RUN_ID="$run_id" \
  "${REGISTRY}/${API_IMAGE_NAME}@${API_DIGEST}" node -e '
    const response = await fetch("http://api:6400/v1/studio/runs", {
      headers: { authorization: "Bearer " + process.env.KORTYX_STUDIO_API_KEY }
    });
    if (!response.ok || !(await response.json()).runs.some(run => run.id === process.env.KORTYX_EXPECTED_RUN_ID)) {
      throw new Error("Pre-upgrade telemetry was not readable after upgrade and restart.");
    }
    const page = await fetch("http://studio:6300/runs", {
      headers: { authorization: "Basic " + Buffer.from(process.env.KORTYX_STUDIO_BASIC_AUTH_USERNAME + ":" + process.env.KORTYX_STUDIO_BASIC_AUTH_PASSWORD).toString("base64") }
    });
    if (!page.ok) throw new Error("Upgraded Studio did not render.");
  '
docker run --rm --network "${project}_default" --env-file "$studio_home/.env" \
  -e KORTYX_API_URL=http://api:6400 -e KORTYX_SMOKE_RUN_ID="$run_id-after" \
  "${REGISTRY}/${API_IMAGE_NAME}@${API_DIGEST}" pnpm --filter @kortyx/api smoke:telemetry
echo "Verified real-image upgrade from $previous_version to $VERSION with unchanged saved Compose, customer data, and credentials."
