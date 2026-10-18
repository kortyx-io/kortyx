---
id: "v0-cloud-recovery"
title: "Delete or recover a workspace"
description: "Understand organization, project, and account deletion, restore eligible Cloud workspaces, and replace keys revoked by a deletion."
keywords: ["kortyx", "cloud", "recovery"]
sidebar_label: "Delete or recover a workspace"
section: "workspaces"
---
# Delete or recover a workspace

Deleting a project or organization affects its workspace data and access. Deleting your personal account affects your login and profile. Read the confirmation for the operation you are about to perform.

## Deletion and recovery

Workspace deletion stops access immediately and revokes affected API keys. Use the deletion controls for the selected organization or project, check the named workspace, and review the confirmation before proceeding.

Owners can restore eligible workspaces in **Settings > Account > Deleted workspaces** before the displayed recovery deadline. The current recovery window is 30 days; the deadline shown for the workspace is authoritative.

## Restore a workspace

1. Open the deleted-workspace list in Account settings.
2. Find the organization or project and check its recovery deadline.
3. Use its restore action where available, then select the restored workspace.
4. Create replacement API keys and update your application server configuration. Old keys remain revoked.
5. Send a request and confirm new activity appears in the restored project.

## Deleted workspaces

A missing item may be outside your ownership or recovery window. A restored organization or project is separate from restoring any credentials. Use the available recovery controls and shown deadlines when deciding what can be recovered.

> **Good to know:** A restored workspace needs new [application API keys](/docs/cloud/api-keys). Follow [connection verification](/docs/studio/connect-project#verify-the-connection) after updating the server; restoring the workspace does not restore its revoked keys.

## Account deletion

Account deletion permanently removes your login/profile and ends your browser sessions. Shared organization data remains. If you are an organization's last owner, transfer ownership or delete that organization before deleting the account. Read [account deletion](/docs/cloud/account#account-deletion).

Next: [Replace API keys](/docs/cloud/api-keys#replace-or-revoke-a-key).
