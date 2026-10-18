---
id: "v0-cloud-troubleshooting"
title: "Troubleshoot Cloud setup"
description: "Check project selection, ingestion credentials, pending email verification, and evaluation connections when Cloud setup does not work."
keywords: ["kortyx", "cloud", "troubleshooting"]
sidebar_label: "Troubleshoot Cloud setup"
section: "help"
---
# Troubleshoot Cloud setup

## My application has no runs

Check that the app's server loaded the intended Cloud endpoint and project write key. Restart or redeploy it after configuration changes. Send a new request through the normal app, then clear Studio filters and check the organization, project, environment, and time range.

A published workflow map or a saved API key does not create a run. Follow [connection verification](/docs/studio/connect-project#verify-the-connection).

## I lost the API key secret

The secret is shown only when the key is created. [Create a replacement](/docs/cloud/api-keys), update the application server, verify delivery, and revoke the old key when it is no longer needed.

## My email change is still pending

Your current email stays active until you verify the new address. Check the new inbox and use the newest verification link. Account settings lets you resend or cancel a pending request. Repeated sends have a one-minute cooldown. See [email changes](/docs/cloud/account#change-your-email-address).

## An evaluation endpoint will not connect

Confirm its exact HTTPS URL and matching application service key. The app must expose the authenticated eval handler and its deployed suites. A Cloud telemetry key cannot replace the endpoint credential. If discovery works but execution fails, inspect the saved error and the app's model, tools, and test-user permissions.

## The CLI rejects my Cloud key

Cloud telemetry keys authorize ingestion, including topology publication. Cloud CLI account login is not implemented, so these keys cannot authenticate Studio read, prompt-management, or connected-evaluation commands. Use the Cloud UI for those operations. [CLI availability](/docs/cli#cloud-support).

> **Good to know:** A Cloud telemetry key can [publish a workflow map](/docs/cli/topology), and [local evaluations](/docs/cli/local-evaluations) can execute your app without Studio. Read-only and management commands have different credential requirements.

## Members or billing controls are unavailable

Controls marked **Soon** are previews. They do not become available by changing SDK settings or obtaining a different application key. Check [current feature availability](/docs/cloud/workspaces#feature-availability).

Next: [Cloud setup](/docs/cloud/get-started) or [sign-in and recovery](/docs/cloud/sign-in).
