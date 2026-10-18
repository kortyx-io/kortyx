---
id: "v0-cli-overview"
title: "Use the Kortyx CLI"
description: "Install the shared Kortyx CLI, publish workflow maps, inspect Studio data, manage prompts, and run local or connected evaluations."
keywords: ["kortyx", "cli"]
sidebar_label: "Overview"
section: "get-started"
---
# Use the Kortyx CLI

The `kortyx` CLI works with your application and Studio. Some commands run entirely on your machine; others call an API. Local installation commands manage Docker containers on your machine.

## Choose a task

- [Install the CLI](/docs/cli/installation) and check command help.
- [Publish workflow topology](/docs/cli/topology) to Cloud or self-hosted Studio.
- [Run a local evaluation](/docs/cli/local-evaluations) directly in your application without Studio.
- [Configure a connection](/docs/cli/connections) to a supported Studio API.
- [Inspect runs and sessions](/docs/cli/inspect) from the terminal.
- [Manage prompts](/docs/cli/prompts), including validation and version transfers.
- [Run connected evaluations](/docs/cli/evaluations) and inspect their saved results.
- [Manage local Studio](/docs/cli/local-studio) containers and credentials.

## Cloud support

Topology publication works with your Cloud telemetry endpoint and write key. Local evaluation commands execute your app directly and can be used whether you send telemetry to Cloud, self-hosting, or nowhere.

Cloud CLI account login is not implemented. Cloud telemetry keys authorize ingestion; they cannot authenticate Studio read, prompt-management, or remote evaluation commands. Use the Cloud UI for those operations. The [connection guide](/docs/cli/connections) explains the credentials required by supported self-hosted APIs.

## Look up a command

Use `kortyx --help` or [the command reference](/docs/cli/reference). For application development, see [SDK documentation](/docs/sdk/start-here). For local infrastructure, see [self-hosting](/docs/self-hosting).
