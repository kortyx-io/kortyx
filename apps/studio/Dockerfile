# syntax=docker/dockerfile:1.7

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
RUN pnpm dlx turbo@2.6.1 prune --scope=kortyx-studio --docker

FROM base AS runner
LABEL org.opencontainers.image.title="Kortyx Studio"
LABEL org.opencontainers.image.description="Source-available, self-hosted observability UI for Kortyx SDK applications."
LABEL org.opencontainers.image.source="https://github.com/kortyx-io/kortyx"
LABEL org.opencontainers.image.documentation="https://github.com/kortyx-io/kortyx/blob/main/docs/studio/self-hosted-preview.md"

ENV HOSTNAME="0.0.0.0"
ENV PORT="6300"
WORKDIR /app
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-studio,target=/pnpm/store pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
COPY --from=pruner /repo/tsconfig.base.json /repo/tsconfig.lib.json ./
RUN pnpm --filter @kortyx/telemetry-contracts build \
  && pnpm exec turbo run build --filter=kortyx-studio^... \
  && pnpm --filter kortyx-studio build \
  && mkdir -p apps/studio/.next/cache/images \
  && chown -R node:node apps/studio/.next/cache

EXPOSE 6300
USER node
CMD ["pnpm", "--filter", "kortyx-studio", "start"]
