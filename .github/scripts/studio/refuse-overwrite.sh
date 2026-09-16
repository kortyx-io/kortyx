#!/usr/bin/env bash
set -euo pipefail

api_release="${REGISTRY}/${API_IMAGE_NAME}:v${VERSION}"
studio_release="${REGISTRY}/${STUDIO_IMAGE_NAME}:v${VERSION}"
if docker buildx imagetools inspect "$api_release" >/dev/null 2>&1; then
  echo "$api_release already exists. Production versions are immutable."
  exit 1
fi
if docker buildx imagetools inspect "$studio_release" >/dev/null 2>&1; then
  echo "$studio_release already exists. Production versions are immutable."
  exit 1
fi
