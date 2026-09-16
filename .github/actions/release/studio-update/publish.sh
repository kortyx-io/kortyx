#!/usr/bin/env bash
set -euo pipefail

jq -n --arg version "$VERSION" \
  --arg api "${REGISTRY}/${API_IMAGE_NAME}@${API_DIGEST}" \
  --arg studio "${REGISTRY}/${STUDIO_IMAGE_NAME}@${STUDIO_DIGEST}" \
  --arg strategy "$DEPLOYMENT_STRATEGY" \
  '{format: 1, installer: 1, version: $version, api: $api, studio: $studio, deployment: {strategy: $strategy}}' \
  > "$RUNNER_TEMP/studio-update.json"
python "$PUBLISHER_ROOT/.github/scripts/studio/update-channel/publish.py" "$RUNNER_TEMP/studio-update.json"
