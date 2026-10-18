# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN apk upgrade --no-cache && corepack enable

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.6.1 prune --scope=kortyx-website --docker

FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
# Turbo 2.6 pruning drops alternate peer snapshots (for example Vite/esbuild).
# Keep the complete frozen lockfile; pnpm installs only the pruned manifests.
COPY --from=pruner /repo/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
# The link audit checks the actual shared help registry during type checking.
COPY --from=pruner /repo/apps/studio/src/lib/studio-help.ts ./apps/studio/src/lib/studio-help.ts
COPY --from=pruner /repo/apps/studio/src/components/ui/help-types.ts ./apps/studio/src/components/ui/help-types.ts
# Documentation version labels also describe packages outside the website graph.
COPY --from=pruner /repo/apps/studio/package.json ./apps/studio/package.json
COPY --from=pruner /repo/packages/cli/package.json ./packages/cli/package.json
COPY --from=pruner /repo/packages/kortyx/package.json ./packages/kortyx/package.json
RUN pnpm --filter kortyx-website build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apk upgrade --no-cache \
  && addgroup -S nodejs \
  && adduser -S nextjs -G nodejs

WORKDIR /app
COPY --from=installer --chown=nextjs:nodejs /repo/apps/website/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /repo/apps/website/.next/static ./apps/website/.next/static
COPY --from=installer --chown=nextjs:nodejs /repo/apps/website/public ./apps/website/public
COPY --from=installer --chown=nextjs:nodejs /repo/apps/website/src/docs ./apps/website/src/docs
COPY --from=installer --chown=nextjs:nodejs /repo/apps/studio/package.json ./apps/studio/package.json
COPY --from=installer --chown=nextjs:nodejs /repo/packages/cli/package.json ./packages/cli/package.json
COPY --from=installer --chown=nextjs:nodejs /repo/packages/kortyx/package.json ./packages/kortyx/package.json

USER nextjs
EXPOSE 3000
CMD ["node", "apps/website/server.js"]
