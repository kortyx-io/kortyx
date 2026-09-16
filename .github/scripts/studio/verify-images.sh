#!/usr/bin/env bash
set -euo pipefail

verify_index() {
  image_ref="$1"
  expected_digest="$2"
  descriptor="$(docker buildx imagetools inspect --format '{{json .}}' "$image_ref")"
  actual_digest="$(printf '%s' "$descriptor" | jq -r '.manifest.digest')"
  platforms="$(printf '%s' "$descriptor" | jq -r '.manifest.manifests[] | select(.platform.os == "linux") | "\(.platform.os)/\(.platform.architecture)"' | sort -u)"

  test "$actual_digest" = "$expected_digest"
  printf '%s\n' "$platforms" | grep -Fx 'linux/amd64'
  printf '%s\n' "$platforms" | grep -Fx 'linux/arm64'
}

verify_index "${REGISTRY}/${API_IMAGE_NAME}:${IMAGE_TAG_PREFIX}${VERSION}" "$API_DIGEST"
verify_index "${REGISTRY}/${STUDIO_IMAGE_NAME}:${IMAGE_TAG_PREFIX}${VERSION}" "$STUDIO_DIGEST"
