#!/usr/bin/env bash
set -euo pipefail

for name in STUDIO_UPDATES_R2_ACCOUNT_ID STUDIO_UPDATES_R2_BUCKET STUDIO_UPDATES_R2_ACCESS_KEY_ID STUDIO_UPDATES_R2_SECRET_ACCESS_KEY; do
  if [ -z "${!name}" ]; then
    echo "Missing update publication configuration: ${name}"
    exit 1
  fi
done
