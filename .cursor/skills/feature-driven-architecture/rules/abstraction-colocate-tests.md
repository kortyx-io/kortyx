---
title: Co-locate Tests With the Code They Cover
impact: MEDIUM
impactDescription: tests move, rename, and delete with their feature
tags: abstraction, testing, colocation
---

## Co-locate Tests With the Code They Cover

Tests should live next to the code they test, inside the feature — not in a
distant top-level `__tests__/` tree that mirrors the source layout. Co-located
tests move, rename, and get deleted together with the code (reinforcing
`boundary-deletable`), make coverage gaps obvious, and keep the feature
self-contained.

**Incorrect (a parallel test tree far from the code):**

```
src/features/invoices/api/get-invoices.ts
tests/features/invoices/api/get-invoices.test.ts   # drifts out of sync; survives deletion
```

**Correct (tests beside the code, or in a local __tests__):**

```
src/features/invoices/
├── api/
│   ├── get-invoices.ts
│   └── get-invoices.test.ts
└── components/
    ├── invoice-table.tsx
    └── __tests__/invoice-table.test.tsx
```

This repo already follows the local-`__tests__` variant (see
`lib/hiring/domain/__tests__`, `components/organisms/__tests__`) — match the
folder you're working in.

Reference: [Feature-Driven Architecture with Next.js](https://dev.to/rufatalv/feature-driven-architecture-with-nextjs-a-better-way-to-structure-your-application-1lph)
