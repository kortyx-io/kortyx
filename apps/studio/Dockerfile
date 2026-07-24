FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HOSTNAME="0.0.0.0"
ENV PORT="6300"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY . .

RUN pnpm install --ignore-scripts --no-frozen-lockfile
RUN pnpm --filter @kortyx/telemetry-contracts build
RUN pnpm --filter kortyx-studio build

EXPOSE 6300

CMD ["pnpm", "--filter", "kortyx-studio", "start"]
