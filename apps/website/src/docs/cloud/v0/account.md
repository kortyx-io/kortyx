---
id: "v0-cloud-account"
title: "Manage your profile and email"
description: "Change your Cloud profile name, verify a new email address, manage pending email changes, and understand account deletion requirements."
keywords: ["kortyx", "cloud", "account"]
sidebar_label: "Manage your profile and email"
section: "account-security"
---
# Manage your profile and email

Open **Settings > Account**. These settings belong to your Kortyx account, separately from your application's users and project API keys.

## Change your name

Select **Edit name**, enter your first and last names, and select **Save name**. Both fields are required. The updated name appears in your profile; your projects, permissions, and connected sign-in accounts stay the same.

## Change your email address

Your email is used for sign-in and account recovery.

1. Select **Change email**, enter an address you can access, and select **Send verification email**.
2. Open the verification link sent to the new address.
3. Return to Account and refresh to check that the new address is verified.

Your current email keeps working until you verify the new one. Requesting a change does not immediately replace it. After a successful change, a notice is also sent to your previous address.

While a change is pending, use **Resend email** if the link expires or **Cancel change** to keep your current email. Use the newest link: cancelling or replacing a request invalidates its earlier links. Wait at least a minute between verification email requests.

If the address is unavailable, try a different one. If you cannot send or receive the message, keep using your current address and retry. Do not remove your existing way to sign in while you are waiting.

## Privacy choices

Product analytics measures how Studio features are used. Your app's activity records let you inspect its runs. They have separate controls: changing the analytics choice does not enable prompt or response capture or stop your app from sending activity.

Your app controls content capture, which is off by default. See [capture configuration](/docs/studio/connect-project#choose-what-content-studio-may-store).

> **Good to know:** Your analytics choice and application payload capture have separate controls. Check [content capture settings](/docs/studio/connect-project#choose-what-content-studio-may-store) when investigating missing text in a [recorded run](/docs/studio/runs#captured-content).

## Personal table preferences

Use **Views** on a Studio table to save an investigation. Saved views and layouts belong to your account within the selected project and are available when you sign in from another browser. They do not change another member's preferences. A local cache loads first and refreshes in the background; [table views](/docs/studio/exploring-data#table-views) explains saving, limits, and recovery when a save fails.

## Account deletion

Account deletion permanently removes your login and profile and ends all browser sessions. Your personal table preferences are removed with your account. Shared organization data is not deleted. If you are an organization's last owner, transfer ownership or delete that organization first. Read the confirmation and follow any sign-in requirement before continuing.

Next: [Manage sign-in methods and browser sessions](/docs/cloud/sign-in), [organizations and projects](/docs/cloud/workspaces), or [workspace recovery](/docs/cloud/recovery).
