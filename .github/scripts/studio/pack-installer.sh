#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$RUNNER_TEMP/studio-installer"
pnpm --dir packages/cli pack --pack-destination "$RUNNER_TEMP/studio-installer"
pnpm --dir packages/kortyx pack --pack-destination "$RUNNER_TEMP/studio-installer"
