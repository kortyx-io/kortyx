# syntax=docker/dockerfile:1.7

FROM docker:28-cli AS docker-cli

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.6.1 prune --scope=@kortyx/api --docker

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
COPY apps/api/docker/kortyx-studio-db /usr/local/bin/kortyx-studio-db
RUN chmod 0755 /usr/local/bin/kortyx-studio-db \
  && pnpm --filter @kortyx/telemetry-contracts build \
  && pnpm --filter @kortyx/telemetry-db build \
  && pnpm --filter @kortyx/api build

EXPOSE 6400
CMD ["node", "apps/api/dist/index.js"]
