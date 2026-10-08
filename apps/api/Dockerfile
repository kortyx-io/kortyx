# syntax=docker/dockerfile:1.7

FROM docker:29-cli AS docker-cli

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.24.0 --activate

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.6.1 prune --scope=@kortyx/api --docker

# The entrypoint drops ordinary commands to node; a root image default is the
# compatibility bridge for updater commands in saved protocol-1 Compose files.
FROM base AS runner
LABEL org.opencontainers.image.title="Kortyx API"
LABEL org.opencontainers.image.description="Telemetry ingestion and read API for self-hosted Kortyx Studio."
LABEL org.opencontainers.image.source="https://github.com/kortyx-io/kortyx"
LABEL org.opencontainers.image.documentation="https://github.com/kortyx-io/kortyx/blob/main/docs/studio/self-hosted-preview.md"

WORKDIR /app
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-api,target=/pnpm/store pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
COPY --from=pruner /repo/tsconfig.base.json /repo/tsconfig.lib.json ./
COPY apps/api/docker/entrypoint.sh /usr/local/bin/kortyx-api-entrypoint
COPY apps/api/docker/kortyx-studio-db /usr/local/bin/kortyx-studio-db
RUN chmod 0755 /usr/local/bin/kortyx-api-entrypoint /usr/local/bin/kortyx-studio-db \
  && pnpm exec turbo run build --filter=@kortyx/api...

EXPOSE 6400
ENTRYPOINT ["kortyx-api-entrypoint"]
CMD ["node", "apps/api/dist/index.js"]
