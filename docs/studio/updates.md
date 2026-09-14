# Studio updates

The standard Kortyx installer includes update management for supported Studio
releases on Linux and macOS with a local Docker daemon. Open **Settings → Updates**
to check for a release, read its release notes, or choose **Update to vX.Y.Z**.
Older images without an updater still work with the installer; they need one
manual upgrade to a release that includes this feature. Windows and externally
managed Compose/PostgreSQL deployments continue to use manual deployment updates.

## Automatic updates

Studio checks `https://updates.kortyx.io/studio/stable.json` roughly every hour.
Checks are staggered by up to five minutes, and failures back off from five
minutes to six hours while respecting CDN `Retry-After` responses. Rapid manual
checks are coalesced. A failed check retains the last known release for display
but cannot trigger automatic installation. Automatic installation
is disabled initially. Enable **Install updates automatically** and select a daily
hour in UTC. A sleeping computer or stopped Docker daemon cannot run an update;
installation waits for the next configured hour when the updater is running.

The updater only installs a newer version. A failed installation turns automatic
updates off. Inspect the error and recover before enabling them again. Manual
downgrades remain an operator action; the updater does not undo database changes.

## What an update does

1. Downloads the API and Studio images using the exact published digests.
2. Pauses Studio and API ingestion and backs up the database, `.env`, generated
   Compose file, and installation configuration. It verifies that the database
   archive can be read before proceeding.
3. Pins the installation to the new image digests and starts it, running database
   migrations through the existing bootstrap service.
4. Waits for health checks, verifies the Studio version, and verifies authenticated
   access to telemetry. Credentials, ports, and the database volume are retained.

Studio and ingestion are briefly unavailable during the backup and restart.
Telemetry producers need retries if events must survive this maintenance window.
If downloading or backup fails before installation, the original version remains
in use (or is restarted). Once installation starts, failures require manual
recovery instead of automatically restoring older images or data.

Progress and errors survive container restarts under `<studio-home>/.updates/`.
The latest operation appears in Settings. Backups live under `.updates/backups/`
and are retained until the operator removes them; monitor disk usage.

## Manual recovery

Read `.updates/operation.json` for the phase, error, and backup directory. Use
`npx kortyx studio logs --home <studio-home> --no-follow` and Docker logs for the
failed services. Automatic installation stays disabled during recovery.

If the database remains compatible, install a fixed release with:

```sh
npx kortyx studio start --home <studio-home> --image-tag vX.Y.Z
```

To restore the previous installation, first stop its API and Studio. Review the
recorded backup and restore its `.env`, `config.json`, and `compose.yml`. Restore
`database.dump` to its Postgres service with `pg_restore --clean --if-exists
--no-owner --exit-on-error -U kortyx -d kortyx`, then start the saved Compose stack.
Database restoration discards writes made after the backup; make that decision
explicitly. Never restore a database while ingestion is running. See the
[backup and restore instructions](../../apps/studio/README.md) for the deployment
commands. Changing image versions alone does not restore an earlier database.

## Deployment design

The API image contains a separate updater entry point and Docker clients. The
installer runs it as an `updater` service with the installation directory and
Docker socket mounted. The regular API and Studio containers have no Docker
socket. Docker socket access gives the updater control of the local Docker host;
use it only with the official, trusted images and on a host you administer.

The updater has no published host port. Studio forwards authenticated administrator
requests using a separate server-only token. Mutation requests must originate
from the same Studio origin. Update controls require Studio Basic Auth; custom
reverse-proxy-only authentication is not supported by these controls yet.

An update runs in an independent, temporary worker container, so replacing the
updater service does not kill its operation. A filesystem lock prevents concurrent
updates and rejects installer starts during an update. Avoid stopping, restarting,
resetting, or rotating credentials while an update is running. After interruption, the controller records a
failed operation and pauses automatic installation. Backups and progress remain
available even when Studio cannot start.

## Release publication

The **Publish Release (Studio)** workflow publishes the stable channel only after
both production image digests pass smoke tests and promotion. Installations make
one public HTTPS request to the CDN; they do not query GitHub's Releases API.

- `studio/releases/X.Y.Z.json` records each version and its exact image digests.
  Conditional creation refuses to replace an existing version with different
  digests. These objects are cached for one year.
- `studio/stable.json` contains the complete currently recommended manifest and is
  cached for five minutes. It is updated last using an ETag conditional write.
  Concurrent publishers re-read the channel; older releases never lower it.
- The publisher reads both objects back from R2 and verifies the public URL,
  allowing time for cache expiry. If CDN publication fails, installed instances
  continue seeing the previous release. A failure after the final write may mean
  the new release is already visible; rerunning the same publication is safe.

The manifest contains the stable version, both official image digests, and the
update format and installer protocol version. Unknown protocols, prereleases,
and arbitrary image repositories are rejected. The release pipeline is the only
intended writer; never store credentials or private files in the public bucket.

### Cloudflare configuration

Use a dedicated Standard R2 bucket named `kortyx-updates`, with no jurisdiction
restriction, connected directly to the custom domain `updates.kortyx.io`.
The website's Docker app and deployment remain independent. Keep the development
`r2.dev` URL disabled. No Worker or customer API token is required.

Create a cache rule matching only `http.host eq "updates.kortyx.io"` that makes
responses eligible for caching and respects the origin Cache-Control header.
JSON is not cached by Cloudflare's default extension rules. Do not put browser
login challenges or Cloudflare Access in front of this machine-readable endpoint.
Verify TLS, JSON content, Cache-Control, and a subsequent `CF-Cache-Status: HIT`.

Configure these repository variables:

- `STUDIO_UPDATES_R2_ACCOUNT_ID`: the Cloudflare account ID.
- `STUDIO_UPDATES_R2_BUCKET`: `kortyx-updates`.

Configure these secrets on the `studio-production` GitHub environment:

- `STUDIO_UPDATES_R2_ACCESS_KEY_ID`
- `STUDIO_UPDATES_R2_SECRET_ACCESS_KEY`

Use an R2 **Object Read & Write** token restricted to this bucket. Do not copy the
DNS or account administration token into CI. The publication script uses the S3
endpoint directly so its version comparison sees current data, not CDN caches.

Run publisher regressions with:

```sh
python3 -m unittest discover -s scripts/studio-release -v
```

After verifying the official image digests, an operator can seed the first
manifest or retry publication with `scripts/studio-release/publish.py`. Install
its pinned requirements in an isolated Python environment, supply the same four
environment variables above, and pass the JSON manifest path. The script is
idempotent and refuses a changed digest for an existing release version.

Installer protocol 1 updates the standard bundled-Postgres Compose installation.
Releases requiring a different Compose topology must use a new installer protocol
and a documented manual installer upgrade; they must not silently reuse protocol 1.
