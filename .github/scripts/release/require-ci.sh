#!/usr/bin/env bash
set -euo pipefail

commit="$(git rev-parse --verify "${RELEASE_COMMIT:-HEAD}^{commit}")"
runs="$(gh run list --repo "$GITHUB_REPOSITORY" --workflow CI --commit "$commit" --event push --limit 100 --json status,conclusion,headBranch)"
if ! jq -e --arg branch "${DEFAULT_BRANCH:-main}" 'map(select(.headBranch == $branch)) | first | .status == "completed" and .conclusion == "success"' <<< "$runs" >/dev/null; then
  echo "::error::Release refused: the latest push CI run for $commit must have completed successfully on the default branch. Re-run its failed CI jobs, then resume Release / Orchestrate for this exact release commit; do not bypass the gate."
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "Release blocked: push CI for \`$commit\` is not green. Re-run the failed CI jobs for that exact commit. A successful CI completion retriggers Release / Orchestrate automatically; manual recovery must use \`release_commit=$commit\`." >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 1
fi
