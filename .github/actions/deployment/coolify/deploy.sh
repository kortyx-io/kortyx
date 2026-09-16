#!/usr/bin/env bash
set -euo pipefail

for name in COOLIFY_TOKEN COOLIFY_URL COOLIFY_APP_UUID; do
  if [ -z "${!name}" ]; then echo "Missing Coolify configuration: $name"; exit 1; fi
done
if [ "$OPERATION" = remove-preview ]; then
  test -n "$PR_NUMBER"
  http_status=$(curl --silent --show-error \
    --output "$RUNNER_TEMP/coolify-preview-delete.json" --write-out '%{http_code}' \
    --request DELETE --header "Authorization: Bearer ${COOLIFY_TOKEN}" \
    "${COOLIFY_URL}/api/v1/applications/${COOLIFY_APP_UUID}/previews/${PR_NUMBER}")
  if [ "$http_status" != 200 ] && [ "$http_status" != 404 ]; then
    echo "Coolify preview cleanup failed with HTTP $http_status."; exit 1
  fi
  echo "Coolify preview cleanup completed with HTTP $http_status."
  exit 0
fi
test "$OPERATION" = deploy
if [ -n "$PR_NUMBER" ]; then
  test -n "$DOCKER_TAG"
  payload=$(jq --null-input --compact-output --arg uuid "$COOLIFY_APP_UUID" \
    --argjson pull_request_id "$PR_NUMBER" --arg docker_tag "$DOCKER_TAG" \
    '{uuid: $uuid, force: true, pull_request_id: $pull_request_id, docker_tag: $docker_tag}')
else
  payload=$(jq --null-input --compact-output --arg uuid "$COOLIFY_APP_UUID" '{uuid: $uuid, force: true}')
fi
response=$(curl --fail-with-body --silent --show-error --request POST \
  --header "Authorization: Bearer ${COOLIFY_TOKEN}" --header 'Content-Type: application/json' \
  --data "$payload" "${COOLIFY_URL}/api/v1/deploy")
deployment_uuid=$(jq --exit-status --raw-output '.deployments[0].deployment_uuid' <<< "$response")
for attempt in $(seq 1 60); do
  deployment=$(curl --fail-with-body --silent --show-error \
    --header "Authorization: Bearer ${COOLIFY_TOKEN}" \
    "${COOLIFY_URL}/api/v1/deployments/${deployment_uuid}")
  status=$(jq --raw-output '.status' <<< "$deployment")
  case "$status" in
    finished) echo "Coolify deployment finished."; exit 0 ;;
    failed|cancelled) echo "Coolify deployment ended with status: $status"; exit 1 ;;
  esac
  if [ "$attempt" -lt 60 ]; then
    echo "Waiting for Coolify deployment ($attempt/60): $status"
    sleep 5
  fi
done
echo 'Timed out waiting for Coolify deployment.'
exit 1
