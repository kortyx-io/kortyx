# syntax=docker/dockerfile:1.7

FROM docker:29-cli AS docker-cli

# Compose v5.6.0's upstream binary still embeds Go 1.26.8. Rebuild the same
# immutable source with the security-patched toolchain for both release platforms.
FROM --platform=$BUILDPLATFORM golang:1.26.9-bookworm AS compose-build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
ADD https://github.com/docker/compose.git#42f48072bbf92ee9b0e43f9fdf2008d03546e7ca /src
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build \
      -mod=readonly -trimpath -tags=e2e \
      -ldflags="-s -w -X github.com/docker/compose/v5/internal.Version=v5.6.0" \
      -o /out/docker-compose ./cmd

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
COPY --from=compose-build /out/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=compose-build /src/LICENSE /usr/share/doc/docker-compose/LICENSE
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-api,target=/pnpm/store pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
COPY --from=pruner /repo/tsconfig.base.json /repo/tsconfig.lib.json ./
COPY apps/api/docker/entrypoint.sh /usr/local/bin/kortyx-api-entrypoint
COPY apps/api/docker/kortyx-studio-db /usr/local/bin/kortyx-studio-db
RUN chmod 0755 /usr/local/bin/kortyx-api-entrypoint /usr/local/bin/kortyx-studio-db \
  && pnpm --filter @kortyx/telemetry-contracts build \
  && pnpm exec turbo run build --filter=@kortyx/agent... \
  && pnpm --filter @kortyx/openai build \
  && pnpm --filter @kortyx/openrouter build \
  && pnpm --filter @kortyx/telemetry-db build \
  && pnpm --filter @kortyx/api build

EXPOSE 6400
ENTRYPOINT ["kortyx-api-entrypoint"]
CMD ["node", "apps/api/dist/index.js"]
