#!/usr/bin/env bash
set -euo pipefail

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
# Validate all four inputs before writing any staging tags. Never use mutable
# per-architecture tags: these digests are artifacts from this exact build run.
for image in api studio; do
  for arch in amd64 arm64; do
    digest="$(cat "$DIGEST_DIR/$image/$arch")"
    [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Invalid image digest" >&2; exit 1; }
  done
done
for image in api studio; do
  image_ref="${REGISTRY}/kortyx-io/kortyx-${image}"
  amd64="$(cat "$DIGEST_DIR/$image/amd64")"
  arm64="$(cat "$DIGEST_DIR/$image/arm64")"
  docker buildx imagetools create \
    --tag "$image_ref:staging-v$VERSION" \
    --tag "$image_ref:staging-latest" \
    "$image_ref@$amd64" "$image_ref@$arm64"
  digest="$(docker buildx imagetools inspect --format '{{json .}}' "$image_ref:staging-v$VERSION" | jq -r '.manifest.digest')"
  [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Invalid image digest" >&2; exit 1; }
  printf '%s_digest=%s\n' "$image" "$digest" >> "$GITHUB_OUTPUT"
done
