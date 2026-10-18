---
id: "v0-studio-publish-prompt"
title: "Review and publish a prompt version"
description: "Check reviews and evaluation evidence, promote a tested prompt version to live, or roll back to an earlier version using its promotion policy."
keywords: ["kortyx", "studio", "publish", "prompt"]
sidebar_label: "Review and publish a prompt version"
section: "prompt-management"
---
# Review and publish a prompt version

Open a saved prompt version and inspect its reviews and evaluation results. Check the actual prompt-use evidence so the result refers to the version you intend to publish.

## Check readiness

A promotion policy can require review and evaluation evidence. Resolve the missing checks shown by Studio before promoting the candidate. A saved draft or successful workflow execution alone does not establish that those checks passed.

## Make the version live

Choose **Make this live** from the version menu. Studio opens **Promote version** for a newer version or **Roll back version** for an earlier one. Review the selected version and confirm. Applications resolving the live prompt then receive that promoted version according to their integration.

> **Good to know:** Rolling back changes which saved version is live and keeps newer versions available. The [promotion policy](/docs/studio/prompts#promotion-policies) still applies. If an evaluation informed the change, review its [saved results](/docs/studio/evaluation-results) before promoting.

Next: [Prompt versions, groups, and composition](/docs/studio/prompts) or [CLI prompt management](/docs/cli/prompts).
