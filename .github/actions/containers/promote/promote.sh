#!/usr/bin/env bash
set -euo pipefail

source_digest="$(docker buildx imagetools inspect --format '{{json .}}' "$SOURCE" | jq -r '.manifest.digest')"
if [ -n "$EXPECTED_DIGEST" ]; then test "$source_digest" = "$EXPECTED_DIGEST"; fi
args=()
while IFS= read -r tag; do
  if [ -n "$tag" ]; then args+=(-t "$tag"); fi
done <<< "$TAGS"
test "${#args[@]}" -gt 0
docker buildx imagetools create "${args[@]}" "$SOURCE"
while IFS= read -r tag; do
  if [ -n "$tag" ]; then
    actual_digest="$(docker buildx imagetools inspect --format '{{json .}}' "$tag" | jq -r '.manifest.digest')"
    test "$actual_digest" = "$source_digest"
  fi
done <<< "$TAGS"
