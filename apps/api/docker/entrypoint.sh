#!/bin/sh
set -eu

# Installer protocol 1 preserves the generated Compose file across image
# updates. Releases before 0.13.0 did not set an explicit user for the updater,
# so keep that command privileged when an old installation starts a new image.
if [ "$(id -u)" -eq 0 ] &&
  [ "${1:-}" = "node" ] &&
  [ "${2:-}" = "apps/api/dist/updater.js" ]; then
  exec "$@"
fi

# API, database initialization, and all other image commands stay
# unprivileged, including deployments that do not use the bundled Compose file.
if [ "$(id -u)" -eq 0 ]; then
  export HOME=/home/node
  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi

exec "$@"
