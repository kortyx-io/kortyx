#!/usr/bin/env bash
set -euo pipefail

prefix="${KORTYX_CI_CONTAINER_PREFIX:-kortyx-ci}"
docker rm --force "${prefix}-redis" "${prefix}-postgres" >/dev/null 2>&1 || true
