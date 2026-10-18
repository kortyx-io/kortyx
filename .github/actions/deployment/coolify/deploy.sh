#!/usr/bin/env bash
set -euo pipefail

for name in COOLIFY_TOKEN COOLIFY_URL COOLIFY_APP_UUID; do
  if [ -z "${!name}" ]; then echo "Missing Coolify configuration: $name"; exit 1; fi
done
if [ "$OPERATION" = remove-preview ]; then
  if ! [[ "$PR_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
    echo 'Invalid preview pull request number.'; exit 1
  fi
  # DELETE is idempotent. Recover a briefly unavailable controller without
  # treating an outage as an absent preview or publishing false success.
  for attempt in $(seq 1 5); do
    http_status=$(curl --silent --show-error --connect-timeout 10 --max-time 60 \
      --output "$RUNNER_TEMP/coolify-preview-delete.json" --write-out '%{http_code}' \
      --request DELETE --header "Authorization: Bearer ${COOLIFY_TOKEN}" \
      "${COOLIFY_URL}/api/v1/applications/${COOLIFY_APP_UUID}/previews/${PR_NUMBER}") || http_status=000
    case "$http_status" in
      200|404) echo "Coolify preview cleanup completed with HTTP $http_status."; exit 0 ;;
      000|408|429|500|502|503|504)
        if [ "$attempt" -lt 5 ]; then
          echo "Coolify preview cleanup temporarily unavailable (HTTP $http_status, attempt $attempt/5)."
          sleep 15
          continue
        fi ;;
    esac
    echo "::error::Coolify preview cleanup failed with HTTP $http_status. Preview removal is unconfirmed; check controller health and rerun this job."
    exit 1
  done
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
