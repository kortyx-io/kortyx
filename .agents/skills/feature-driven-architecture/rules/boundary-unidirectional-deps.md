---
title: Keep Dependencies Unidirectional (shared → features → app)
impact: HIGH
impactDescription: eliminates circular dependencies; makes layers safely refactorable
tags: boundaries, dependencies, layers, eslint
---

## Keep Dependencies Unidirectional (shared → features → app)

Code should flow in one direction. Shared building blocks (`components/`,
`hooks/`, `lib/`, `utils/`, `types/`) know nothing about features. Features build
on shared code but never reach up into `app/`. The `app/` layer composes
features. This single constraint kills circular dependencies and means each layer
can be refactored without surprising the layers below it.

```
shared  ──▶  features  ──▶  app
(generic)    (domains)      (routes/composition)
   ▲ never imports up ────────────┘
```

This generalizes the same rule Feature-Sliced Design states as *"modules on one
layer can only import from layers strictly below."*

**Incorrect (dependencies pointing the wrong way):**

```ts
// components/button/button.tsx  (shared) importing a feature
import { useAuth } from "@/features/auth";          // ❌ shared → features (up)

// features/auth/hooks/use-auth.ts  importing a route
import { metadata } from "@/app/login/page";        // ❌ features → app (up)
```

**Correct (dependencies point down only):**

```ts
// features/auth/components/sign-in.tsx
import { Button } from "@/components/button/button"; // ✓ features → shared (down)

// app/login/page.tsx
import { SignIn } from "@/features/auth";            // ✓ app → features (down)
```

Enforce it mechanically with ESLint `import/no-restricted-paths` (bulletproof-react
ships this config): forbid `app` from being imported by `features`, and forbid
`features` from being imported by shared folders. A violation is a design smell —
the code is probably in the wrong layer.

Reference: [bulletproof-react — unidirectional codebase](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) · [Feature-Sliced Design layers](https://feature-sliced.design/docs/get-started/overview)
