---
id: "v0-self-hosting-overview"
title: "Host Kortyx Studio yourself"
description: "Choose local development or a team deployment, connect an application, and plan credentials, backups, upgrades, and availability for Studio."
keywords: ["kortyx", "self-hosting"]
sidebar_label: "Overview"
section: "get-started"
---
# Host Kortyx Studio yourself

Self-hosted Studio runs the interface, telemetry API, and PostgreSQL on your infrastructure. Your application sends activity to that API and continues to execute its own workflows.

## Start locally

Follow [Run Studio locally](/docs/self-hosting/run-locally). The CLI starts the Docker stack and generates local credentials. Connect your application and [inspect the first run](/docs/studio/first-run).

## Deploy for a team

Use [Deploy on a server](/docs/self-hosting/deploy-server) for the portable container contract or [AWS CDK](/docs/self-hosting/deploy-aws-cdk) for its maintained deployment integration. Review [credentials and secrets](/docs/self-hosting/credentials-secrets) before exposing the installation.

## Operate the installation

Plan [backups, restoration, and upgrades](/docs/self-hosting/operations). Read [multiple-replica deployment](/docs/self-hosting/high-availability) before changing availability assumptions. Operators also configure [evaluation targets and judging](/docs/self-hosting/configure-evaluations).

## Use Studio and the CLI

The [Studio guides](/docs/studio/overview) explain inspection, prompts, and evaluations for both editions. The [shared CLI docs](/docs/cli) cover application commands and [local container management](/docs/cli/local-studio).

Look up [configuration variables](/docs/self-hosting/configuration-reference) when setting defaults or applying a release. If you prefer a managed installation, [start with Cloud](/docs/cloud/get-started).
