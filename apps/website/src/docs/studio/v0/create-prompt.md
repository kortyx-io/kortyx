---
id: "v0-studio-create-prompt"
title: "Create and test a prompt"
description: "Create a prompt with explicit inputs, save a version, and test it against your application before making it available as the live version."
keywords: ["kortyx", "studio", "create", "prompt"]
sidebar_label: "Create and test a prompt"
section: "prompt-management"
---
# Create and test a prompt

Open **Prompt Management > Prompts** and create a prompt. Give it a stable key your application will use, plus a name you can recognize in the library.

## Add messages and inputs

Write the system and user messages. Add further messages with an explicit role if your application contract supports chat prompts. Declare template inputs in the input JSON Schema, then reference them with `{{message}}` or a dotted path such as `{{customer.name}}`.

Keep configuration values separate from message text. The configuration is returned as `prompt.config` and validated against the registered contract; it is not substituted into messages. Store credentials in the application's secret manager.

## Save a version

Review the message order, template inputs, and configuration, then save the changes.

> **Good to know:** Saving creates a version you can test. Applications requesting the live prompt receive it only after [review and promotion](/docs/studio/publish-prompt). Check the [prompt integration](/docs/studio/prompts#connect-an-application) to see how your app selects a version.

## Test the candidate

Connect the application and its prompt contracts through the [prompt integration guide](/docs/studio/prompts#connect-an-application). Launch a representative evaluation with the candidate selected, then inspect its result and actual prompt-use evidence. A candidate selection alone does not prove the model used it.

Next: [Review and publish a version](/docs/studio/publish-prompt) or [look up prompt composition and editor behavior](/docs/studio/prompts).
