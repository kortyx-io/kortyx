#!/usr/bin/env bash
set -euo pipefail

{
  echo "## Recovered Studio self-hosted v${VERSION} update channel"
  echo
  echo "| Image | Verified production digest |"
  echo "| --- | --- |"
  echo "| API | \`${API_DIGEST}\` |"
  echo "| Studio | \`${STUDIO_DIGEST}\` |"
} >> "$GITHUB_STEP_SUMMARY"
