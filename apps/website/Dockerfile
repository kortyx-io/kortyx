# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.6.1 prune --scope=kortyx-website --docker

FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
RUN pnpm --filter kortyx-website build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

WORKDIR /app
COPY --from=installer --chown=nextjs:nodejs /repo/apps/website/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /repo/apps/website/.next/static ./apps/website/.next/static
COPY --from=installer --chown=nextjs:nodejs /repo/apps/website/public ./apps/website/public
COPY --from=installer --chown=nextjs:nodejs /repo/apps/website/src/docs ./apps/website/src/docs

USER nextjs
EXPOSE 3000
CMD ["node", "apps/website/server.js"]
