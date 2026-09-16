#!/usr/bin/env bash
set -euo pipefail

kind="$1"
container="${KORTYX_CI_CONTAINER_PREFIX:-kortyx-ci}-${kind}"
args=(--detach --name "$container")
case "$kind" in
  redis)
    port="${KORTYX_TEST_REDIS_PORT:-6379}"
    internal_port=6379
    image=redis:7-alpine
    health='redis-cli ping'
    url="redis://127.0.0.1:${port}"
    variable=KORTYX_TEST_REDIS_URL
    ;;
  postgres)
    port="${KORTYX_TEST_POSTGRES_PORT:-5432}"
    internal_port=5432
    image=postgres:17-alpine
    health='pg_isready -U kortyx -d kortyx_runtime_test'
    url="postgres://kortyx:kortyx@127.0.0.1:${port}/kortyx_runtime_test"
    variable=KORTYX_TEST_POSTGRES_URL
    args+=(--env POSTGRES_USER=kortyx --env POSTGRES_PASSWORD=kortyx --env POSTGRES_DB=kortyx_runtime_test)
    ;;
  *) echo "Unknown database: $kind"; exit 1 ;;
esac

docker run "${args[@]}" --publish "127.0.0.1:${port}:${internal_port}" \
  --health-cmd "$health" --health-interval 2s --health-timeout 5s \
  --health-retries 20 "$image"
for attempt in $(seq 1 60); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
  if [ "$status" = healthy ]; then
    echo "${variable}=${url}" >> "$GITHUB_ENV"
    exit 0
  fi
  if [ "$status" = unhealthy ]; then break; fi
  sleep 2
done
docker logs "$container"
echo "$kind did not become healthy."
exit 1
