#!/usr/bin/env bash
set -euo pipefail

commit="$(git rev-parse --verify "${RELEASE_COMMIT:-HEAD}^{commit}")"
runs="$(gh run list --repo "$GITHUB_REPOSITORY" --workflow CI --commit "$commit" --event push --limit 100 --json status,conclusion,headBranch)"
if ! jq -e --arg branch "${DEFAULT_BRANCH:-main}" 'map(select(.headBranch == $branch)) | first | .status == "completed" and .conclusion == "success"' <<< "$runs" >/dev/null; then
  echo "Release refused: the latest push CI run for $commit must have completed successfully on the default branch."
  exit 1
fi
