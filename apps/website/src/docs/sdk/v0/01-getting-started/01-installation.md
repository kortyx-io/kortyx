---
id: v0-installation
title: "Installation"
description: "Install the Kortyx TypeScript framework, check runtime prerequisites, and understand package dependencies before building your first agent workflow."
keywords: [kortyx, installation, nodejs, pnpm, environment]
sidebar_label: "Installation"
---
# Installation

## Prerequisites

- Node.js 20+
- pnpm (recommended in this monorepo)
- Zod `^4.5.0` (Zod 4.5 or later within major version 4)

## Install the main package

```bash tabs="install-kortyx" tab="pnpm"
pnpm add kortyx "zod@^4.5.0"
```

```bash tabs="install-kortyx" tab="npm"
npm install kortyx "zod@^4.5.0"
```

```bash tabs="install-kortyx" tab="yarn"
yarn add kortyx "zod@^4.5.0"
```

```bash tabs="install-kortyx" tab="bun"
bun add kortyx "zod@^4.5.0"
```

If you prefer scoped packages, see [Package Overview](../05-reference/01-package-overview.md).

## Runtime dependency notes

Zod is a peer dependency of Kortyx and the schema-based scoped packages. Keep
one compatible Zod version shared by your application and the SDK. Separate
versions can cause TypeScript schema errors even when both are Zod 4. If your
application already uses Zod `^4.5.0`, it can keep that version; you do not need
to upgrade to the latest release. Zod 3 and Zod 4.0–4.4 are unsupported.

`kortyx` already re-exports agent/runtime/hooks/providers/stream APIs.

You still need provider credentials at runtime (for example Google):

```bash
export GOOGLE_API_KEY=your_key_here
```
