---
id: "v0-cloud-overview"
title: "Use Kortyx Cloud"
description: "Get started with managed Kortyx Studio, connect your application, and find the settings for projects, credentials, sign-in, and recovery."
keywords: ["kortyx", "cloud"]
sidebar_label: "Overview"
section: "get-started"
---
# Use Kortyx Cloud

Kortyx Cloud hosts Studio, the telemetry API, and their storage. Your application continues running its agents and workflows on its own server.

## Get your first run into Studio

Follow [Get started with Cloud](/docs/cloud/get-started) to create a project, connect your application, and verify a real run. Once data arrives, [explore that run](/docs/studio/first-run).

## Manage your workspace

- [Organizations and projects](/docs/cloud/workspaces): choose the workspace whose data and settings you want to use.
- [API keys](/docs/cloud/api-keys): create, replace, and revoke application write credentials.
- [Evaluation connections](/docs/cloud/evaluations): register the application endpoint and connect a provider for Studio judging.
- [Account and email](/docs/cloud/account): update your profile and verify a new email address.
- [Sign-in and browser sessions](/docs/cloud/sign-in): manage passwords, passkeys, connected accounts, and signed-in browsers.
- [Deletion and recovery](/docs/cloud/recovery): understand the affected scope and restore eligible workspaces.

## Use the shared Studio guides

[Inspect runs](/docs/studio/runs), [investigate performance](/docs/studio/slow-runs), [manage prompts](/docs/studio/create-prompt), and [evaluate changes](/docs/studio/first-eval) use the same Studio guides as a self-hosted installation.

The [shared CLI](/docs/cli) can publish topology to Cloud. Check its availability notes before using connection-based Studio commands; Cloud CLI login is not implemented.

If setup is blocked or data is missing, start with [Cloud troubleshooting](/docs/cloud/troubleshooting).
