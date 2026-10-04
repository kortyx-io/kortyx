---
id: v0-installation
title: "Installation"
description: "Install Kortyx, set required environment variables, and configure basic project settings."
keywords: [kortyx, installation, nodejs, pnpm, environment]
sidebar_label: "Installation"
---
# Installation

## Prerequisites

- Node.js 20+
- pnpm (recommended in this monorepo)

## Install the main package

```bash tabs="install-kortyx" tab="pnpm"
pnpm add kortyx
```

```bash tabs="install-kortyx" tab="npm"
npm install kortyx
```

```bash tabs="install-kortyx" tab="yarn"
yarn add kortyx
```

```bash tabs="install-kortyx" tab="bun"
bun add kortyx
```

If you prefer scoped packages, see [Package Overview](../05-reference/01-package-overview.md).

## Runtime dependency notes

`kortyx` already re-exports agent/runtime/hooks/providers/stream APIs.

You still need provider credentials at runtime (for example Google):

```bash
export GOOGLE_API_KEY=your_key_here
```
