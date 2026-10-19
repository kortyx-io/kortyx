---
id: "v0-cloud-api-keys"
title: "Manage Cloud API keys"
description: "Create and store a project telemetry key, replace a lost secret, and revoke old credentials without confusing them with sign-in or provider keys."
keywords: ["kortyx", "cloud", "api", "keys"]
sidebar_label: "Manage Cloud API keys"
section: "connections"
---
# Manage Cloud API keys

Cloud SDK keys authorize telemetry writes for one project. They are separate from your browser sign-in and from credentials used to call your application's evaluation endpoint or a model provider.

## Create and save a key

1. Select the intended organization and project.
2. Open **Settings → API keys** and create a key where your permissions allow it.
3. Copy and save the secret immediately. It is shown only at creation; reloading or closing the creation result cannot reveal it again.
4. Add it to your application's server configuration as `KORTYX_TELEMETRY_API_KEY`. The SDK defaults to `https://api.kortyx.io`; Cloud needs no endpoint setting.

Use **Settings → Connection** for the SDK configuration, and follow the shared [connection guide](/docs/studio/connect-project). Never put a secret in source, screenshots, browser storage, or public environment variables.

## Replace or revoke a key

Create a replacement, update the application's server secret, and verify a real run reaches the intended project. Revoke the old key after consumers have switched. Revocation stops future authenticated use; it does not delete stored observations or sign out browser sessions.

If a key is lost, create a replacement instead of trying to reveal it. If the application receives access denied, check that its configured key is valid, unrevoked, and belongs to the intended project.

> **Good to know:** Revoking an SDK key stops future writes but keeps recorded runs. [Browser sign-in sessions](/docs/cloud/sign-in#browser-sessions) are separate, and [evaluation endpoints](/docs/cloud/evaluations#application-endpoints) use their own credential.

## Keep credentials separate

| Credential | Purpose |
| --- | --- |
| Cloud browser session | Your interactive Studio access |
| SDK telemetry key | Your application's project-scoped telemetry writes |
| Application eval credential | Cloud calling your application's eval endpoint |
| Provider credential | Studio's supported model operations |

Next: [Cloud setup](/docs/cloud/get-started), [Cloud evaluations](/docs/cloud/evaluations), or [Workspace recovery](/docs/cloud/workspaces#deletion-and-recovery).
