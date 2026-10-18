---
id: "v0-cli-installation"
title: "Install the CLI"
description: "Run the Kortyx CLI through your package manager, pin it for project automation, and check command help without starting Studio."
keywords: ["kortyx", "cli", "installation"]
sidebar_label: "Install the CLI"
section: "get-started"
---
# Install the CLI

Use Node.js 22 or later. You can run the CLI through the public `kortyx` package:

```bash tabs="cli-first-command" tab="pnpm"
pnpm dlx kortyx --help
```

```bash tabs="cli-first-command" tab="npm"
npx kortyx --help
```

For a project that already depends on `kortyx`, use its installed executable:

```bash tabs="cli-project-command" tab="pnpm"
pnpm exec kortyx --help
```

```bash tabs="cli-project-command" tab="npm"
npm exec -- kortyx --help
```

Pin the package in your project's lockfile for automation. Use the version installed by that project when comparing command behavior with your application dependencies.

> **Good to know:** Use the project-pinned CLI in automation so its command behavior matches your lockfile. [Evaluation automation](/docs/cli/evaluation-automation) shows how to inspect acceptance and final grades separately.

## Check installation

Help should list the available command groups. It does not create containers, connect to an API, or run a workflow.

Next: [Publish workflow topology](/docs/cli/topology), [run a local evaluation](/docs/cli/local-evaluations), or [set up a connection](/docs/cli/connections).
