FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY . .

RUN pnpm install --ignore-scripts --no-frozen-lockfile
RUN pnpm --filter @kortyx/telemetry-contracts build
RUN pnpm --filter @kortyx/telemetry-db build
RUN pnpm --filter @kortyx/api build

EXPOSE 6400

CMD ["node", "apps/api/dist/index.js"]
