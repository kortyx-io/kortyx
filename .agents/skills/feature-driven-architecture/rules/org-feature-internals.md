---
title: Structure Each Feature as a Mini-App
impact: HIGH
impactDescription: consistent internals make any feature instantly navigable
tags: organization, features, structure
---

## Structure Each Feature as a Mini-App

A feature is where 80–90% of the work happens, so give it a small, purposeful
internal structure. Co-locate everything the domain needs, but do not create a
folder merely to represent an architectural layer. Start with the files the
feature needs; add a folder only when it makes the feature easier to navigate.

**Incorrect (ad-hoc, inconsistent internals):**

```
src/features/financial-risk/
├── RiskChart.tsx
├── helpers.ts          # mix of hooks, fetchers, formatters
├── api.ts              # also has types in it
└── risk-table.tsx
```

**Correct (a minimal, purposeful feature):**

```
src/features/financial-risk/
├── components/         # feature UI
│   ├── risk-chart.tsx
│   └── risk-table.tsx
├── lib/                # pure feature helpers
│   └── risk-format.ts
└── schema.ts            # Zod schemas and inferred types, if needed
```

Add `hooks/` for feature hooks, `api/` for external I/O, and `data/` for
temporary mock/demo data only when they are needed. Prefer `schema.ts` until
schemas warrant a `schema/` folder. Do not introduce repositories, services,
or a generic `mappers/` folder by default.

When a schema is present, Zod is the single source of truth: validate with the
schema and infer matching TypeScript types with `z.infer`. Do not maintain a
parallel interface for the same contract.

It is fine for `risk-table.tsx` to briefly duplicate logic from another feature's
`positions-table.tsx`. Cohesion within the feature beats early sharing across
features.

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
