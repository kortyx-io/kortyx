---
id: "v0-cloud-get-started"
title: "Get started with Cloud"
description: "Create a Cloud project, save its API key, connect an existing Kortyx application, and verify the first workflow run in Studio."
keywords: ["kortyx", "cloud", "get", "started"]
sidebar_label: "Get started with Cloud"
section: "get-started"
---
# Get started with Cloud

You need a working Kortyx application and access to its server configuration. If you are starting a new application, begin with the [SDK quickstarts](/docs/sdk/getting-started).

## Complete setup

1. Sign in to your Cloud Studio address, or create an account. Complete email verification when requested.
2. Complete the Terms step, create or select an organization and project, and finish or skip the optional profile step.
3. Create a project API key. Copy its secret while it is visible and store it in your application's private server configuration. You cannot reveal the secret again.
4. Copy the SDK connection configuration from setup or **Settings > Connection**. If you choose to set up later, return to those Settings when ready.

## Connect the server

Follow [Connect your application](/docs/studio/connect-project). Install the adapter, load the configuration you copied, and attach it to your agent. Use this project's Cloud endpoint and write key.

Your application owns its workflow models, tools, permissions, and content-capture settings. Keep the write key on the server; never put it in browser code. Cloud sign-in does not automatically connect your application.

## Verify the first result

Run one real request through your application's normal interface. Open **Runs** in Studio, select the matching organization/project, and choose a time range containing the request. Clear filters if needed.

> **Good to know:** The connection works when the row appears and its steps open. Prompt text can remain unavailable because [content capture](/docs/studio/connect-project#choose-what-content-studio-may-store) is off by default. Use [your first-run walkthrough](/docs/studio/first-run) to inspect the recorded activity.

If the request does not appear, follow [Cloud troubleshooting](/docs/cloud/troubleshooting). A saved key alone does not prove the app delivered activity.

## Continue

[Explore your first run](/docs/studio/first-run), then [publish the workflow map](/docs/cli/topology) if you want to see declared paths before they execute.
