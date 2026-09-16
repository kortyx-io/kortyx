#!/usr/bin/env bash
set -euo pipefail

ref="${GITHUB_REF_NAME}"
version="${ref#website-v}"
if [ -z "$version" ] || [ "$version" = "$ref" ]; then
  echo "Expected tag format website-v<version>, got: $ref"
  exit 1
fi
echo "version=$version" >> "$GITHUB_OUTPUT"
