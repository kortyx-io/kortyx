#!/usr/bin/env bash
set -euo pipefail

headers=$(curl --silent --show-error --head --retry 10 --retry-all-errors \
  --retry-delay 3 "${PREVIEW_URL}")

if ! grep --ignore-case --quiet '^location: https://.*\.cloudflareaccess\.com/' <<<"${headers}"; then
  echo "Preview URL is not protected by Cloudflare Access: ${PREVIEW_URL}"
  exit 1
fi

echo "### Website preview" >> "${GITHUB_STEP_SUMMARY}"
echo "[${PREVIEW_URL}](${PREVIEW_URL})" >> "${GITHUB_STEP_SUMMARY}"
