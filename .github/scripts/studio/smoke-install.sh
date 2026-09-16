#!/usr/bin/env bash
set -euo pipefail

clean_dir="$RUNNER_TEMP/kortyx-clean-install"
studio_home="$RUNNER_TEMP/kortyx-studio-home"
backup_dir="$RUNNER_TEMP/kortyx-studio-backup"
api_ref="${REGISTRY}/${API_IMAGE_NAME}@${API_DIGEST}"
studio_ref="${REGISTRY}/${STUDIO_IMAGE_NAME}@${STUDIO_DIGEST}"
api_tag="${REGISTRY}/${API_IMAGE_NAME}:staging-v${VERSION}"
studio_tag="${REGISTRY}/${STUDIO_IMAGE_NAME}:staging-v${VERSION}"

cleanup() {
  result=$?
  if [ "$result" -ne 0 ] && [ -f "$studio_home/compose.yml" ]; then
    docker compose --env-file "$studio_home/.env" -f "$studio_home/compose.yml" ps || true
    docker compose --env-file "$studio_home/.env" -f "$studio_home/compose.yml" logs --no-color || true
  fi
  if [ -x "$clean_dir/node_modules/.bin/kortyx" ] && [ -f "$studio_home/config.json" ]; then
    "$clean_dir/node_modules/.bin/kortyx" studio reset --home "$studio_home" --confirm || true
  fi
  # The updater writes root-owned state inside its bind-mounted home.
  # Remove only this disposable CI home with elevated permissions.
  sudo rm -rf -- "$studio_home"
  rm -rf -- "$clean_dir" "$backup_dir"
  exit "$result"
}
trap cleanup EXIT

descriptor_digest() {
  docker buildx imagetools inspect --format '{{json .}}' "$1" | jq -r '.manifest.digest'
}

test "$(descriptor_digest "$api_tag")" = "$API_DIGEST"
test "$(descriptor_digest "$studio_tag")" = "$STUDIO_DIGEST"

mapfile -t package_files < <(find "$RUNNER_TEMP/studio-installer" -name '*.tgz' -type f | sort)
test "${#package_files[@]}" -eq 2
mkdir -p "$clean_dir"
npm install --prefix "$clean_dir" --ignore-scripts "${package_files[@]}"

cli="$clean_dir/node_modules/.bin/kortyx"
"$cli" --help

test "$(docker run --rm "$api_ref" node -p 'process.arch')" = "$EXPECTED_NODE_ARCH"
docker run --rm --network none "$api_ref" \
  pnpm --filter @kortyx/api exec vitest run test/studio-updater-ownership.test.ts
test "$(docker run --rm "$studio_ref" node -p 'process.arch')" = "$EXPECTED_NODE_ARCH"
test "$(docker run --rm "$studio_ref" node -p 'require("/app/apps/studio/package.json").version')" = "$VERSION"

KORTYX_API_IMAGE="${REGISTRY}/${API_IMAGE_NAME}" \
KORTYX_STUDIO_IMAGE="${REGISTRY}/${STUDIO_IMAGE_NAME}" \
  "$cli" studio start \
    --home "$studio_home" \
    --api-port 16400 \
    --studio-port 16300 \
    --image-tag "staging-v${VERSION}" \
    --project-name "kortyx-studio-release-${ARCH_ID}"

credentials_before="$(sha256sum "$studio_home/.env" | cut -d ' ' -f 1)"
smoke_run_id="release-smoke-${VERSION}-${ARCH_ID}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
mkdir -m 700 "$backup_dir"

docker run --rm --network host \
  --env-file "$studio_home/.env" \
  -e KORTYX_API_URL=http://127.0.0.1:16400 \
  -e KORTYX_SMOKE_RUN_ID="$smoke_run_id" \
  "$api_ref" \
  pnpm --filter @kortyx/api smoke:telemetry

"$cli" studio credentials --home "$studio_home" > "$backup_dir/credentials.txt"
grep -Fq "KORTYX_TELEMETRY_API_URL=http://localhost:16400" "$backup_dir/credentials.txt"
grep -Fq "KORTYX_TELEMETRY_API_KEY=" "$backup_dir/credentials.txt"
cp -p "$studio_home/.env" "$studio_home/config.json" "$backup_dir/"
docker compose \
  --env-file "$studio_home/.env" \
  -f "$studio_home/compose.yml" \
  exec -T postgres \
  pg_dump -U kortyx -d kortyx -Fc > "$backup_dir/database.dump"
test -s "$backup_dir/database.dump"

"$cli" studio stop --home "$studio_home"
KORTYX_API_IMAGE="${REGISTRY}/${API_IMAGE_NAME}" \
KORTYX_STUDIO_IMAGE="${REGISTRY}/${STUDIO_IMAGE_NAME}" \
  "$cli" studio start --home "$studio_home"

credentials_after="$(sha256sum "$studio_home/.env" | cut -d ' ' -f 1)"
test "$credentials_before" = "$credentials_after"

verify_smoke_run() {
  docker run --rm --network host \
    --env-file "$studio_home/.env" \
    -e KORTYX_API_URL=http://127.0.0.1:16400 \
    -e KORTYX_EXPECTED_SMOKE_RUN_ID="$smoke_run_id" \
    "$api_ref" \
    node -e '
      const apiUrl = process.env.KORTYX_API_URL;
      const expected = process.env.KORTYX_EXPECTED_SMOKE_RUN_ID;
      const key = process.env.KORTYX_STUDIO_API_KEY;
      fetch(`${apiUrl}/v1/studio/runs`, {
        headers: { authorization: `Bearer ${key}` },
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(await response.text());
          return response.json();
        })
        .then(({ runs }) => {
          if (!runs.some(({ id }) => id === expected)) {
            throw new Error(`Persisted smoke run ${expected} was not found.`);
          }
          console.log(`Verified persisted smoke run ${expected}.`);
        });
    '
}
verify_smoke_run

docker compose \
  --env-file "$studio_home/.env" \
  -f "$studio_home/compose.yml" \
  stop api studio
docker compose \
  --env-file "$studio_home/.env" \
  -f "$studio_home/compose.yml" \
  exec -T postgres \
  pg_restore --clean --if-exists --no-owner --exit-on-error \
    -U kortyx -d kortyx < "$backup_dir/database.dump"
"$cli" studio restart --home "$studio_home"
verify_smoke_run

"$cli" studio status --home "$studio_home"
"$cli" studio logs --home "$studio_home" --no-follow

old_studio_key="$(sed -n 's/^KORTYX_STUDIO_API_KEY=//p' "$studio_home/.env")"
old_telemetry_key="$(sed -n 's/^KORTYX_TELEMETRY_API_KEY=//p' "$studio_home/.env")"
"$cli" studio credentials --home "$studio_home" --rotate \
  > "$backup_dir/rotated-credentials.txt"
new_studio_key="$(sed -n 's/^KORTYX_STUDIO_API_KEY=//p' "$studio_home/.env")"
new_telemetry_key="$(sed -n 's/^KORTYX_TELEMETRY_API_KEY=//p' "$studio_home/.env")"
test "$old_studio_key" != "$new_studio_key"
test "$old_telemetry_key" != "$new_telemetry_key"
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -H "Authorization: Bearer $old_studio_key" \
  http://127.0.0.1:16400/v1/studio/runs)" = "401"
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -H "Authorization: Bearer $new_studio_key" \
  http://127.0.0.1:16400/v1/studio/runs)" = "200"

KORTYX_API_IMAGE="${REGISTRY}/${API_IMAGE_NAME}" \
KORTYX_STUDIO_IMAGE="${REGISTRY}/${STUDIO_IMAGE_NAME}" \
KORTYX_STUDIO_IMAGE_TAG="staging-v${VERSION}" \
KORTYX_SMOKE_ID="${ARCH_ID}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" \
KORTYX_SMOKE_API_PORT=26400 \
KORTYX_SMOKE_STUDIO_PORT=26300 \
  ./scripts/smoke-studio-external-postgres.sh
