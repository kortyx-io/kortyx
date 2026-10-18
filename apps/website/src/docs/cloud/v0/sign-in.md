---
id: "v0-cloud-sign-in"
title: "Manage sign-in and browser sessions"
description: "Set passwords, add passkeys, manage linked sign-in accounts, and review browsers signed in to the same Kortyx Cloud account."
keywords: ["kortyx", "cloud", "sign", "in"]
sidebar_label: "Manage sign-in and browser sessions"
section: "account-security"
---
# Manage sign-in and browser sessions

Open **Settings > Account** and find **Sign-in methods**. The options shown depend on the methods enabled for your account and Cloud installation.

## Manage sign-in methods

This section lists the ways you can sign in to the same Kortyx account. Available options depend on which methods are enabled for your Cloud environment.

Connect Google or GitHub using **Connect** beside the provider. Follow its sign-in steps, then return to Account and check that it says **Connected**. Connecting a provider does not create a new workspace.

If that Google or GitHub account is already connected to another Kortyx account, sign in to that account first. Keep another way to sign in before disconnecting the provider there, then return to connect it to the intended account.

### Password

Use **Set password** or **Change password** to follow the secure password setup steps. You can reset a forgotten password from the sign-in page.

### Passkeys

A passkey lets you sign in with your device's fingerprint, face unlock, or a security key. Select **Add a passkey** when it is available and follow your browser's instructions. Use a device you trust. Adding a passkey is optional.

Saved passkeys appear by name so you can remove one you no longer use. Removing a passkey stops it from working for this account.

### Disconnect a sign-in method

Select **Disconnect** for a connected provider or **Remove** for a saved passkey. Read the confirmation before continuing. Your account and projects stay; that sign-in option stops working.

Keep at least one way to sign in. If removal is blocked, add another sign-in method first. If Studio cannot check your connected methods, refresh and retry instead of assuming one has been removed.

## Confirm your identity

For sensitive changes, Studio may ask you to sign in again if your last sign-in was more than five minutes ago. Select **Confirm your identity**, complete sign-in, then return to Account and repeat the intended change. Confirming your identity alone does not submit the change.

If you cancel a sign-in or account-linking step, your existing Studio session stays available. Check the status in Account before trying again.

> **Good to know:** Ending a browser session leaves your application credentials working. Use [API key revocation](/docs/cloud/api-keys#replace-or-revoke-a-key) to stop application writes; [account deletion](/docs/cloud/account#account-deletion) has a broader scope.

## Browser sessions

Review the browsers signed in to your account. Ending one session signs that browser out; it does not revoke your app's API keys or delete recorded runs. Ending your current session returns you to sign-in. Use the all-sessions control when you want to sign out everywhere.

**Remember me** is chosen on the sign-in page. It is separate from how long an app API key remains valid. Account settings never shows reusable browser credentials or provider tokens.

Next: [Change your profile or email](/docs/cloud/account).
