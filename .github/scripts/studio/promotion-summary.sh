#!/usr/bin/env bash
set -euo pipefail

{
  echo "## Studio self-hosted v${VERSION}"
  echo
  echo "| Image | Tested and promoted digest |"
  echo "| --- | --- |"
  echo "| API | \`${API_DIGEST}\` |"
  echo "| Studio | \`${STUDIO_DIGEST}\` |"
  echo
  echo "Native clean-install smoke tests passed on linux/amd64 and linux/arm64."
} >> "$GITHUB_STEP_SUMMARY"
