# Operate self-hosted Kortyx Studio

This guide covers backup, restore, upgrades, reset, networking, security, and
troubleshooting for the self-hosted preview. Complete
[Run Kortyx Studio locally](./self-hosted-preview.md) first.

This guide operates the CLI-managed local stack. For an external PostgreSQL
database or container platform, use [Deploy on a server](./deploy-on-server.md)
and the [deployment contract](./deployment-contract.md).

## Where Studio stores data

The CLI stores the default installation under `~/.kortyx/studio`:

- `.env` contains generated credentials and secrets;
- `config.json` records the selected image tag and ports;
- `compose.yml` defines the generated local stack; and
- the Docker volume contains Postgres data.

Protect the entire directory and any database backup as secrets.

## Back up

Back up both Postgres and the generated credentials:

```bash
studio_home="${KORTYX_STUDIO_HOME:-$HOME/.kortyx/studio}"
backup_dir="kortyx-studio-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$backup_dir"
cp -p "$studio_home/.env" "$studio_home/config.json" "$backup_dir/"
docker compose \
  --env-file "$studio_home/.env" \
  -f "$studio_home/compose.yml" \
  exec -T postgres \
  pg_dump -U kortyx -d kortyx -Fc > "$backup_dir/database.dump"
```

The backup contains Studio credentials, telemetry API keys, and captured
telemetry content. Store it accordingly.

## Restore

Restore into the same Studio version first. Stop telemetry producers, or
otherwise prevent writes during the restore:

```bash
studio_home="${KORTYX_STUDIO_HOME:-$HOME/.kortyx/studio}"
backup_dir="/path/to/kortyx-studio-backup"
npx kortyx studio stop
cp -p "$backup_dir/.env" "$backup_dir/config.json" "$studio_home/"
docker compose \
  --env-file "$studio_home/.env" \
  -f "$studio_home/compose.yml" \
  up -d postgres
docker compose \
  --env-file "$studio_home/.env" \
  -f "$studio_home/compose.yml" \
  exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U kortyx -d kortyx \
  < "$backup_dir/database.dump"
npx kortyx studio start
```

After verifying the restored installation, upgrade normally. Test restores
against a non-production copy before relying on the procedure.

## Upgrade

Back up first, then pin the intended published release:

```bash
npx kortyx studio start --image-tag vX.Y.Z
```

Every start pulls the selected images. The bootstrap container applies forward
database migrations before the API starts. Existing data and credentials remain
in the Studio home.

Database downgrades are not supported. Do not point an older Studio release at
a database migrated by a newer release. Restore a backup made with the older
version instead.

## Reset

This command permanently deletes the local Postgres volume:

```bash
npx kortyx studio reset --confirm
```

Generated credentials remain in the Studio home. The next `studio start`
creates a fresh database and bootstraps those keys again. Reset only after the
telemetry is no longer needed or is backed up.

## Network and security boundary

- CLI-managed Studio and API ports bind to `127.0.0.1` by default.
- Studio human access uses generated HTTP Basic Auth credentials. Basic Auth is
  only base64-encoded on the wire, so remote access requires HTTPS through a
  trusted reverse proxy.
- Never expose Postgres to the public internet.
- Do not expose the telemetry API broadly. Place it on a trusted network and
  allow only the SDK producers that need its scoped write key.
- The Studio read key, telemetry write key, database password, key pepper, and
  Basic Auth password live in `~/.kortyx/studio/.env`.
- Content capture is controlled by the telemetry producer and is off by
  default.

The advanced image-based Compose file also binds each service to `127.0.0.1`
by default. Changing `KORTYX_STUDIO_BIND_ADDRESS` or
`KORTYX_API_BIND_ADDRESS` to `0.0.0.0` is an explicit deployment decision, not
a complete remote-security configuration. Keep
`KORTYX_POSTGRES_BIND_ADDRESS=127.0.0.1`.

## Troubleshoot

Check the stack and recent logs first:

```bash
npx kortyx studio status
npx kortyx studio logs --no-follow
```

Common failures:

- **Docker cannot be reached:** start Docker Desktop or the Docker daemon and
  confirm `docker version` and `docker compose version` succeed.
- **A port is occupied:** choose different Studio and API ports with
  `studio start --studio-port <port> --api-port <port>`.
- **Images cannot be pulled:** verify GHCR and internet access, then retry.
- **Studio rejects the sign-in:** run `npx kortyx studio credentials` and use
  the generated username and password for that Studio home.
- **No telemetry appears:** confirm the server process uses the printed API URL
  and key, then verify the selected time range includes the event.
- **Studio reports an invalid service key:** confirm Studio and the database
  bootstrap job received the same `KORTYX_STUDIO_API_KEY` and pepper. A database
  restored without its matching environment cannot verify the key. Restart the
  browser after correcting the deployment so a stale response is not mistaken
  for a continuing service-key failure.
- **A migration fails:** keep the database intact, collect logs, and restore the
  pre-upgrade backup if necessary. Do not run an older image against the
  migrated database.

Report security issues through [SECURITY.md](../../SECURITY.md), not a public
issue.
