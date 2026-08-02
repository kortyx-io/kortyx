---
id: v0-studio-credentials-secrets
title: "Kortyx Studio Credentials and Secrets"
description: "Understand Studio credential roles, safe storage, local rotation, and remote deployment practices."
keywords: [kortyx, studio, credentials, secrets, api-key, rotation]
sidebar_label: "Credentials and Secrets"
---
# Kortyx Studio Credentials and Secrets

Studio separates human sign-in, SDK ingestion, internal reads, database access, and API-key verification. These credentials have different consumers and must not be reused interchangeably.

## Credential roles

| Credential | Consumer | Stored as raw value in Kortyx PostgreSQL? | If rotated |
| --- | --- | --- | --- |
| Basic Auth username/password | Human browser | No | Existing browser sign-in stops working |
| Telemetry write key | Server-side Kortyx SDK producer | No | Producers using the old key receive `401` |
| Studio read key | Studio server | No | Studio cannot load data until updated |
| API-key pepper | Telemetry API and database job | No | Changing it invalidates every API key |
| PostgreSQL credentials | API and database job | Provider-managed | Database and workloads must rotate together |

Kortyx stores the API key identifier, a one-way HMAC verifier, Project ownership, scopes, expiry, revocation state, and usage metadata. The complete `ktyx_...` value belongs only in the secret store used by its consumer.

> **Why both a database record and a secret manager?** The secret manager protects the raw credential. PostgreSQL holds the verifier and authorization policy needed to check that credential without retaining a reusable key.

## Local credentials

The CLI creates and stores local values privately under `~/.kortyx/studio`.

Print the current connection details:

```bash
npx kortyx studio credentials
```

Rotate the browser password, telemetry key secret, and Studio key secret:

```bash
npx kortyx studio credentials --rotate
```

The CLI updates the private environment atomically, applies the new key verifiers, recreates the affected services, and attempts to restore the previous values if the application fails.

Rotation invalidates the previous telemetry key immediately. Update and restart every server-side SDK producer using that key. PostgreSQL credentials and the API-key pepper are deliberately preserved.

## Generate credentials for a deployment

```bash
npx kortyx studio credentials --generate
```

This command prints a fresh deployment credential set without writing local state. Store the output immediately; it cannot be retrieved later.

Use the secret facility appropriate to the target:

| Platform | Recommended destination |
| --- | --- |
| AWS | Secrets Manager or an approved equivalent |
| Google Cloud | Secret Manager |
| Kubernetes | External secret integration or a tightly controlled Secret |
| Controlled single server | A root/operator-readable environment file outside the repository |

Do not put secret values in Terraform source, generated manifests, image layers, CI logs, tickets, chat, or screenshots.

## Remote key rotation

The initial deployment contract replaces an API-key secret while retaining its key ID:

1. Preserve the prefix through the final underscore, such as `ktyx_live_<key-id>_`.
2. Generate a new random secret of at least 32 bytes and append it.
3. Update the consumer's secret-manager value.
4. Run `kortyx-studio-db bootstrap` with the new complete key.
5. Roll or restart the affected consumer.
6. Verify that the new key works and the previous key receives `401 Unauthorized`.

Reusing the key ID replaces its verifier. For the Studio read key, run bootstrap before recreating Studio. For one telemetry write key shared by multiple applications, coordinate a maintenance window; overlapping remote keys are not yet managed through an Admin API.

> **Do not rotate the pepper during routine key rotation.** A new pepper makes every existing API-key verifier unusable.

## Backup and incident response

Back up PostgreSQL and deployment secret references as one recovery set. A database backup without its matching pepper cannot verify the existing API keys.

If a raw API key is exposed:

1. replace its secret under the same key ID;
2. rerun bootstrap;
3. roll the affected consumer;
4. verify the new key; and
5. verify the exposed value now receives `401 Unauthorized`.

Treat captured telemetry backups according to the sensitivity of any input or output content your producers chose to export.
