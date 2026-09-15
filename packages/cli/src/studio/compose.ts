export const STUDIO_COMPOSE_FILE = `name: \${KORTYX_COMPOSE_PROJECT_NAME:-kortyx-studio}

x-api-env: &api-env
  DATABASE_URL: postgres://kortyx:\${POSTGRES_PASSWORD}@postgres:5432/kortyx
  KORTYX_API_KEY_PEPPER: \${KORTYX_API_KEY_PEPPER}

x-bootstrap-keys: &bootstrap-keys
  KORTYX_TELEMETRY_API_KEY: \${KORTYX_TELEMETRY_API_KEY}
  KORTYX_STUDIO_API_KEY: \${KORTYX_STUDIO_API_KEY}

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: kortyx
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: kortyx
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kortyx -d kortyx"]
      interval: 2s
      timeout: 5s
      retries: 30

  db-init:
    image: \${KORTYX_API_IMAGE_REF:-\${KORTYX_API_IMAGE:-ghcr.io/kortyx-io/kortyx-api}:\${KORTYX_STUDIO_IMAGE_TAG:-latest}}
    pull_policy: \${KORTYX_STUDIO_PULL_POLICY:-always}
    environment:
      <<: [*api-env, *bootstrap-keys]
    command: >
      sh -lc "pnpm --filter @kortyx/telemetry-db db:migrate &&
      pnpm --filter @kortyx/telemetry-db db:bootstrap"
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  api:
    image: \${KORTYX_API_IMAGE_REF:-\${KORTYX_API_IMAGE:-ghcr.io/kortyx-io/kortyx-api}:\${KORTYX_STUDIO_IMAGE_TAG:-latest}}
    pull_policy: \${KORTYX_STUDIO_PULL_POLICY:-always}
    environment:
      <<: *api-env
      NODE_ENV: production
      API_HOST: 0.0.0.0
      API_PORT: 6400
    ports:
      - "127.0.0.1:\${API_PORT:-6400}:6400"
    depends_on:
      db-init:
        condition: service_completed_successfully
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \\"fetch('http://localhost:6400/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\\"",
        ]
      interval: 5s
      timeout: 5s
      retries: 30

  studio:
    image: \${KORTYX_STUDIO_IMAGE_REF:-\${KORTYX_STUDIO_IMAGE:-ghcr.io/kortyx-io/kortyx-studio}:\${KORTYX_STUDIO_IMAGE_TAG:-latest}}
    pull_policy: \${KORTYX_STUDIO_PULL_POLICY:-always}
    environment:
      NODE_ENV: production
      PORT: 6300
      KORTYX_API_URL: http://api:6400
      KORTYX_STUDIO_API_KEY: \${KORTYX_STUDIO_API_KEY}
      KORTYX_STUDIO_UPDATER_URL: http://updater:6410
      KORTYX_STUDIO_UPDATE_TOKEN: \${KORTYX_STUDIO_UPDATE_TOKEN}
      KORTYX_STUDIO_AUTH_MODE: basic
      KORTYX_STUDIO_BASIC_AUTH_USERNAME: \${KORTYX_STUDIO_BASIC_AUTH_USERNAME}
      KORTYX_STUDIO_BASIC_AUTH_PASSWORD: \${KORTYX_STUDIO_BASIC_AUTH_PASSWORD}
    ports:
      - "127.0.0.1:\${STUDIO_PORT:-6300}:6300"
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \\"fetch('http://localhost:6300').then((r)=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))\\"",
        ]
      interval: 5s
      timeout: 5s
      retries: 30

  updater:
    image: \${KORTYX_API_IMAGE_REF:-\${KORTYX_API_IMAGE:-ghcr.io/kortyx-io/kortyx-api}:\${KORTYX_STUDIO_IMAGE_TAG:-latest}}
    pull_policy: \${KORTYX_STUDIO_PULL_POLICY:-always}
    restart: unless-stopped
    command: ["node", "apps/api/dist/updater.js", "serve", "\${KORTYX_STUDIO_STATE_DIR}"]
    volumes:
      - type: bind
        source: \${KORTYX_STUDIO_STATE_DIR}
        target: \${KORTYX_STUDIO_STATE_DIR}
      - /var/run/docker.sock:/var/run/docker.sock
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:6410/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 5s
      timeout: 5s
      retries: 30

volumes:
  postgres-data:
`;

export function studioComposeFile(updater: boolean): string {
  if (updater) return STUDIO_COMPOSE_FILE;
  return STUDIO_COMPOSE_FILE.replace(
    /\n {2}updater:[\s\S]*?\nvolumes:/,
    "\nvolumes:",
  )
    .replace(/ {6}KORTYX_STUDIO_UPDATER_URL:.*\n/, "")
    .replace(/ {6}KORTYX_STUDIO_UPDATE_TOKEN:.*\n/, "");
}
