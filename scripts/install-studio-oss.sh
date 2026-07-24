#!/usr/bin/env sh
set -eu

install_dir="${KORTYX_STUDIO_INSTALL_DIR:-kortyx-studio}"
base_url="${KORTYX_STUDIO_BASE_URL:-https://raw.githubusercontent.com/kortyx-io/kortyx/main}"
compose_file="docker-compose.oss.yml"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

random_hex() {
  openssl rand -hex "$1"
}

random_secret() {
  openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n'
}

api_key() {
  key_id="$1"
  printf 'ktyx_live_%s_%s\n' "$key_id" "$(random_secret)"
}

download() {
  source_url="$1"
  target_path="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$source_url" -o "$target_path"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -q "$source_url" -O "$target_path"
    return
  fi

  echo "Missing required command: curl or wget" >&2
  exit 1
}

require_command docker
require_command openssl

mkdir -p "$install_dir"
cd "$install_dir"

download "$base_url/$compose_file" "$compose_file"

if [ ! -f .env ]; then
  cat > .env <<EOF
KORTYX_STUDIO_IMAGE_TAG=${KORTYX_STUDIO_IMAGE_TAG:-latest}

POSTGRES_PORT=${POSTGRES_PORT:-5432}
API_PORT=${API_PORT:-6400}
STUDIO_PORT=${STUDIO_PORT:-6300}

POSTGRES_DB=kortyx
POSTGRES_PASSWORD=$(random_secret)

KORTYX_API_KEY_PEPPER=$(random_secret)
KORTYX_TELEMETRY_API_KEY=$(api_key "telemetry$(random_hex 4)")
KORTYX_STUDIO_API_KEY=$(api_key "studio$(random_hex 4)")

KORTYX_STUDIO_AUTH_MODE=basic
KORTYX_STUDIO_BASIC_AUTH_USERNAME=${KORTYX_STUDIO_BASIC_AUTH_USERNAME:-admin}
KORTYX_STUDIO_BASIC_AUTH_PASSWORD=$(random_secret)
EOF
  echo "Created $install_dir/.env with generated secrets."
else
  echo "Using existing $install_dir/.env."
fi

docker compose -f "$compose_file" up -d

echo
echo "Kortyx Studio OSS is starting."
echo "Studio: http://localhost:${STUDIO_PORT:-6300}"
echo "API:    http://localhost:${API_PORT:-6400}"
echo
echo "To update later:"
echo "  cd $install_dir"
echo "  docker compose -f $compose_file pull"
echo "  docker compose -f $compose_file up -d"
