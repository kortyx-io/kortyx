---
id: v0-start-here
title: "Start Here"
description: "Choose your Kortyx path for building reliable, production-grade AI systems with explicit runtime control."
keywords: [kortyx, start-here, production, b2b, saas, workflows]
sidebar_label: "Start Here"
---
# Start Here

Kortyx is an opinionated framework for teams building production AI features that need explicit behavior, predictable runtime flow, and strong control over providers, streaming, and state.

## Choose your path

- New project setup: [Installation](../01-getting-started/01-installation.md)
- First end-to-end flow (recommended for live chunking): [Quickstart (Next.js API Route)](../01-getting-started/02-quickstart-nextjs.md)
- Server Action variant (buffered return, no live chunk UI): [Quickstart (Next.js Server Action)](../01-getting-started/03-quickstart-nextjs-server-action.md)
- Build mental model first: [Define Workflows](../02-core-concepts/01-define-workflows.md), [Nodes](../02-core-concepts/03-nodes.md), and [Runtime Context](../02-core-concepts/08-runtime-context.md)
- Implement task-oriented features: [Project Structure](../03-guides/01-project-structure.md), [Rendering Streamed Chat](../03-guides/04-render-streamed-chat.md), and [Interrupts and Resume](../03-guides/02-interrupts-and-resume.md)
- Harden for production: [Production](../04-production/01-persistence.md)
- Verify exact APIs and protocols: [Reference](../05-reference/01-package-overview.md)

## Stack direction

- Next.js: fastest path for an initial app integration.
- Express/Fastify: strong fit for server-heavy orchestration and infrastructure-owned deployments.
  - Start with [React Frontend + Node Backend](../03-guides/03-react-node-backend.md)
  - Then read [streamChat](../02-core-concepts/06-stream-chat.md)
  - Then configure [Runtime Persistence Adapters](../04-production/02-framework-adapters.md)

> **Good to know:** The docs are TypeScript-first and prioritize system-builder workflows with production reliability in mind.
