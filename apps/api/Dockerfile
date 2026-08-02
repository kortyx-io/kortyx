FROM node:22-bookworm-slim

LABEL org.opencontainers.image.title="Kortyx API"
LABEL org.opencontainers.image.description="Telemetry ingestion and read API for self-hosted Kortyx Studio."
LABEL org.opencontainers.image.source="https://github.com/kortyx-io/kortyx"
LABEL org.opencontainers.image.documentation="https://github.com/kortyx-io/kortyx/blob/main/docs/studio/self-hosted-preview.md"

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY . .

COPY apps/api/docker/kortyx-studio-db /usr/local/bin/kortyx-studio-db
RUN chmod 0755 /usr/local/bin/kortyx-studio-db

RUN pnpm install --ignore-scripts --no-frozen-lockfile
RUN pnpm --filter @kortyx/telemetry-contracts build
RUN pnpm --filter @kortyx/telemetry-db build
RUN pnpm --filter @kortyx/api build

EXPOSE 6400

CMD ["node", "apps/api/dist/index.js"]
