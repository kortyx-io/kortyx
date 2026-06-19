---
title: Import a Feature's Public API, Never Its Internals
impact: HIGH
impactDescription: keeps features independently refactorable
tags: boundaries, imports, encapsulation
---

## Import a Feature's Public API, Never Its Internals

Cross-feature imports must go through the feature's `index.ts`. Deep imports into
another feature's `components/`, `hooks/`, or `services/` create implicit
coupling: the importing feature now depends on internal file paths that the
owning team expects to be free to move. When every feature imports only public
surfaces, dependencies stay explicit and any feature can be reorganized inside
its folder without breaking the rest of the app.

**Incorrect (reaching past the boundary):**

```ts
// features/billing/components/billing-panel.tsx
import { useAuth } from "@/features/auth/hooks/use-auth";        // deep import
import { formatUser } from "@/features/auth/services/format";    // private helper
```

**Correct (consume the public API):**

```ts
// features/billing/components/billing-panel.tsx
import { useAuth } from "@/features/auth";
```

Enforce it mechanically with an ESLint boundary rule (e.g.
`no-restricted-imports` or `eslint-plugin-boundaries`) that forbids paths
matching `@/features/*/!(index)`. A failing import is a design smell: either the
thing should be in the feature's public API, or it should be shared code (see
`abstraction-rule-of-two`).

Reference: [Feature-Driven Architecture with Next.js](https://dev.to/rufatalv/feature-driven-architecture-with-nextjs-a-better-way-to-structure-your-application-1lph)
