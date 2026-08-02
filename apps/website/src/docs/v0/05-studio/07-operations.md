---
id: v0-studio-operations
title: "Operate and Troubleshoot Kortyx Studio"
description: "Back up, restore, upgrade, reset, secure, and troubleshoot a self-hosted Kortyx Studio installation."
keywords: [kortyx, studio, operations, backup, restore, upgrade, troubleshooting]
sidebar_label: "Operations and Troubleshooting"
---
# Operate and Troubleshoot Kortyx Studio

This guide covers the CLI-managed local stack. For external PostgreSQL or a container platform, apply the same lifecycle principles through your infrastructure tooling and use [Deploy on a Server](./06-deploy-server.md).

## Know the durable state

The default local installation lives under `~/.kortyx/studio`:

| Item | Purpose |
| --- | --- |
| `.env` | Generated credentials and secrets |
| `config.json` | Selected image tag, ports, username, and Compose project |
| `compose.yml` | Generated local stack definition |
| Docker PostgreSQL volume | Runs, sessions, telemetry, projections, and key verifier records |

Protect the directory and database backups as secrets. A useful recovery set contains both the database and the matching credentials, especially the API-key pepper.

## Back up a local installation

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

The backup may contain Studio credentials, telemetry keys, and captured application content. Store and retain it accordingly.

## Restore

Restore into the same Studio version first. Stop telemetry producers, or otherwise prevent writes during the restore:

```bash
studio_home="${KORTYX_STUDIO_HOME:-$HOME/.kortyx/studio}"
backup_dir=/path/to/kortyx-studio-backup

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

Test restoration against a non-production copy before relying on the procedure. After verifying the restored installation, upgrade normally.

## Upgrade

Back up first, then pin the intended published release:

```bash
npx kortyx studio start --image-tag vX.Y.Z
```

Start pulls the selected images and applies forward database migrations before the API starts. Existing data and credentials remain in the Studio home.

Database downgrade is unsupported. Do not point an older Studio image at a database migrated by a newer release; restore the matching older backup instead.

## Reset local data

```bash
npx kortyx studio reset --confirm
```

> **Permanent deletion:** Reset removes the local PostgreSQL volume. Generated credentials remain, and the next start creates an empty database using those credentials.

## Security checklist

- [ ] Studio and the telemetry API are private or protected by an explicit network boundary.
- [ ] Remote human access uses HTTPS.
- [ ] PostgreSQL is not exposed publicly.
- [ ] SDK write keys exist only in application-server secret storage.
- [ ] The Studio read key exists only in the Studio server environment.
- [ ] Input/output content capture matches your data policy.
- [ ] Backups include the database and corresponding secret references.
- [ ] Image versions are pinned for managed deployments.

## Troubleshoot in order

Start with service state and recent logs:

```bash
npx kortyx studio status
npx kortyx studio logs --no-follow
```

| Symptom | What to check |
| --- | --- |
| Docker cannot be reached | Start Docker, then verify `docker version` and `docker compose version` |
| A port is occupied | Restart with `--studio-port <port>` and `--api-port <port>` |
| Images cannot be pulled | Verify access to GHCR and retry |
| Browser sign-in is rejected | Print current values with `npx kortyx studio credentials` |
| No runs appear | Verify the server environment, API reachability, application restart, and Studio time filter |
| `Invalid telemetry API key` | Confirm the SDK uses the current Project write key and matching installation |
| Studio reports an invalid service key | Confirm Studio and bootstrap use the same Studio read key and pepper |
| Migration fails | Preserve the database, collect logs, and restore the pre-upgrade backup if needed |

### After credential rotation

If the SDK receives `401 Unauthorized`, it is probably still using the previous telemetry key. Print the new credentials, update the server-only application environment, and restart the producer.

If Studio itself reports an invalid service key, confirm the bootstrap job applied the same `KORTYX_STUDIO_API_KEY` that the Studio server presents. A restored database without its matching pepper cannot verify existing keys.

### Interrupt looks pending after its deadline

Studio derives expiry from `expiresAt`; the SDK does not need an in-process timer to emit an expiry event. Refresh or live updates should project an overdue pending interrupt as **Expired**.

A late user response cannot resume the expired run. Your application's fallback may still process that input as a new run, which is expected and should remain distinct in Studio.

Report security vulnerabilities privately through the repository's [security policy](https://github.com/kortyx-io/kortyx/security/policy), not a public issue.
