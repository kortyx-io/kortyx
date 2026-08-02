# Kortyx Studio credentials and secrets

Kortyx Studio uses separate credentials for humans, SDK producers, internal
Studio reads, database access, and API-key verification. They are intentionally
not interchangeable.

## Credential roles

| Credential | Consumer | Stored by Kortyx PostgreSQL? | Rotation consequence |
| --- | --- | --- | --- |
| Basic Auth username/password | Human browser | No | Existing browser sign-in stops working |
| Telemetry write key | Server-side Kortyx SDK producer | Verifier and policy only | Every producer using the old secret must be updated |
| Studio read key | Studio server | Verifier and policy only | Studio cannot read until its service secret is updated |
| API-key pepper | Telemetry API and database job | No | Changing it invalidates every API key |
| PostgreSQL credentials | API and database job | PostgreSQL/provider-managed | Requires coordinated database and workload rotation |

The raw `ktyx_...` value is never stored in the `api_keys` table. Kortyx stores
its key ID, HMAC verifier, Project, scopes, expiry, revocation state, and usage
metadata. The raw value belongs in the secret manager used by its consumer.

## Local installation

Print the existing values:

```bash
npx kortyx studio credentials
```

Rotate the browser password, telemetry key secret, and Studio key secret:

```bash
npx kortyx studio credentials --rotate
```

The CLI updates the private environment file atomically, applies the new API
key verifiers, recreates the affected services, and automatically attempts to
restore the previous values if application fails. PostgreSQL credentials and
the API-key pepper are deliberately preserved.

Local rotation invalidates the previous telemetry key immediately. Update the
server-only configuration of every local SDK producer with the newly printed
value.

## New remote deployment

Generate values without writing local state:

```bash
npx kortyx studio credentials --generate
```

Store the result immediately. It cannot be retrieved later because it was not
persisted. In AWS use Secrets Manager or an equivalent approved store; in
Google Cloud use Secret Manager; in Kubernetes use an externally managed
Secret or secret-store integration.

Secret-manager products store raw secret values. Kortyx PostgreSQL still needs
the verifier records because it owns Project scope, permissions, expiry, and
revocation.

## Remote rotation in the initial preview

The first remote deployment contract supports coordinated replacement using
the existing key IDs:

1. Preserve the prefix through the final underscore, for example
   `ktyx_live_<key-id>_`.
2. Generate a new 32-byte-or-longer random secret and append it.
3. Update the secret-manager value used by the consumer.
4. Run `kortyx-studio-db bootstrap` with the new complete key.
5. Roll or restart the affected consumer.
6. Verify authentication.

Reusing the key ID replaces its verifier, so the previous raw key stops working.
For the Studio read key, run bootstrap before recreating Studio. For a telemetry
write key used by multiple applications, coordinate a maintenance window; the
preview does not yet provide two-key overlap through a remote Admin API.

Do not rotate the pepper as part of ordinary API-key rotation. Do not change a
database password only in the container configuration; update PostgreSQL and
its secret-manager value as one provider-supported operation.

## Backup and incident response

Back up the database and deployment secret references together. A database
backup without its pepper cannot verify existing API keys. A leaked raw API key
should be treated as compromised even if the database remains secure.

Until the remote Admin API is available, respond to a leaked key by replacing
its secret under the same key ID, rerunning bootstrap, rolling the consumer,
and verifying that the previous value receives `401 Unauthorized`.
