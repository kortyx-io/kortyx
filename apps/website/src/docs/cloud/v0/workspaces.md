---
id: "v0-cloud-workspaces"
title: "Manage organizations and projects"
description: "Choose the Cloud workspace for your data and API keys, create or rename projects where permitted, and understand environment labels."
keywords: ["kortyx", "cloud", "workspaces"]
sidebar_label: "Manage organizations and projects"
section: "workspaces"
---
# Manage organizations and projects

Organizations group projects. A project separates execution data and API keys. The users and tenants reported by your application are a separate concept.

## Select or create a workspace

Use the organization and project selectors in the navigation bar. Switching changes the workspace being inspected. Organization settings describe the selected organization; project settings describe the selected project. Workspace controls appear according to your permissions.

Use **Settings → Projects** to inspect/create projects where permitted, and the project's General settings to rename it. Keep separate projects when you need separate keys and data. A renamed project retains its identity.

## Environments

> **Good to know:** An environment is a label your app sends, not a separate project or permission boundary. Check [filters and time range](/docs/studio/exploring-data#search-and-filters) before diagnosing [missing runs](/docs/cloud/troubleshooting#my-application-has-no-runs).

## Feature availability

The current Members screen is a **Soon** preview. Invitations and team management are not available through that screen; Pro and billing are not enabled. A disabled preview control does not indicate a missing account permission that you can fix by configuring the SDK.

## Deletion and recovery

Deleting a workspace stops access and revokes its keys. Eligible workspaces can be restored during the deadline shown in Account settings. Restoring them does not restore revoked keys. Follow [deletion and recovery](/docs/cloud/recovery) before making changes.

Next: [Create an API key](/docs/cloud/api-keys) or [inspect a run](/docs/studio/first-run).
