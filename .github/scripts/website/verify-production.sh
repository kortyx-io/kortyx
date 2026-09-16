#!/usr/bin/env bash
set -euo pipefail

headers=$(curl --fail --silent --show-error --head \
  --retry 10 --retry-all-errors --retry-delay 3 \
  "${PRODUCTION_URL}/docs/start-here")

if grep --ignore-case --quiet '^x-robots-tag:.*noindex' <<<"${headers}"; then
  echo "Production URL unexpectedly has the noindex header."
  exit 1
fi

echo "Production smoke test passed: ${PRODUCTION_URL}"
