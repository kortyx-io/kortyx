---
title: Expose a Deliberate Public API per Feature
impact: HIGH
impactDescription: turns implicit coupling into explicit, reviewable dependencies
tags: boundaries, public-api, encapsulation
---

## Expose a Deliberate Public API per Feature

Each feature should declare what the rest of the app may use through a single
entry point (`index.ts`). Everything not re-exported is private. This makes
cross-feature dependencies explicit and reviewable, and lets you refactor a
feature's internals freely as long as its public surface holds.

**Incorrect (no surface — everything is reachable):**

```ts
// Another feature reaches into arbitrary internals
import { signIn } from "@/features/auth/services/auth";
import { validatePassword } from "@/features/auth/services/internal-helpers";
```

**Correct (a curated public API):**

```ts
// features/auth/index.ts
export * from "./components";          // SignIn, SignUp
export { useAuth } from "./hooks";
export { signIn, signOut } from "./services";
export type { User, AuthCredentials } from "./types";
// internal-helpers is intentionally NOT exported
```

```ts
// consumers import only the public surface
import { SignIn, useAuth } from "@/features/auth";
```

> **⚠️ The community is split on barrels — know the trade-off.**
> Feature-Sliced Design treats a per-slice public API (`index.ts`) as core.
> **bulletproof-react takes the opposite stance** and recommends *against* barrel
> files: *"it can cause issues for Vite to do tree shaking and can lead to
> performance issues. Therefore, it is recommended to import the files
> directly."* This also matches the `bundle-barrel-imports` rule in the
> `react-best-practices` skill — a deep barrel can pull a feature's whole module
> graph into a bundle.
>
> Reconcile them this way: keep the **boundary** (only public things are imported
> across features) but don't force every import through a barrel on hot client
> paths. Options: keep barrels shallow, configure `optimizePackageImports`, import
> client-heavy modules by direct path, or enforce the boundary with ESLint
> `import/no-restricted-paths` (see `boundary-no-deep-imports`) instead of a
> barrel. Use a public API for **clarity of dependencies**, not reflexively.

Reference: [Feature-Driven Architecture with Next.js](https://dev.to/rufatalv/feature-driven-architecture-with-nextjs-a-better-way-to-structure-your-application-1lph) · [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) · [Feature-Sliced Design](https://feature-sliced.design/)
