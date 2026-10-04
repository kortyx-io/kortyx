---
id: v0-migration-and-versions
title: "Migration & Versions"
description: "Versioning and migration guidance for evolving Kortyx apps safely across releases."
keywords: [kortyx, migration, versions, upgrade]
sidebar_label: "Migration & Versions"
---
# Migration & Versions

This section tracks upgrade guidance and behavior changes across versions.

## Current policy

- Within the same SDK major version, docs are updated in place.
- The latest SDK docs use `/docs/sdk/...`. Previous majors remain available at `/docs/sdk/vN/...`.
- Studio has its own documentation and version history at `/docs/studio`.
- New major versions should include dedicated upgrade notes and breaking-change guidance.

## What to check before upgrading

1. API changes across agent/runtime/hooks/providers packages.
2. Provider setup and model initialization expectations.
3. Streaming and interrupt/resume behavior in your app path.

## Related docs

- [API Surface](../05-reference/02-api-surface.md)
- [Provider API](../05-reference/04-provider-api.md)
- [Interrupts and Resume](../03-guides/02-interrupts-and-resume.md)

> **Good to know:** When your app is production-critical, validate upgrade changes in a staging workflow before rollout.
