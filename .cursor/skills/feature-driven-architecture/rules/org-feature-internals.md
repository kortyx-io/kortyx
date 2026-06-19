---
title: Structure Each Feature as a Mini-App
impact: HIGH
impactDescription: consistent internals make any feature instantly navigable
tags: organization, features, structure
---

## Structure Each Feature as a Mini-App

A feature is where 80–90% of the work happens, so give every feature the same
predictable internal shape: `components/`, `hooks/`, `api/`, and `types/`. When
all features share one structure, any developer can open an unfamiliar feature
and know exactly where things are. Co-locate everything the domain needs — UI,
hooks, data access, and types — and resist hoisting "shared-looking" code out
too early (see `abstraction-rule-of-two`).

**Incorrect (ad-hoc, inconsistent internals):**

```
src/features/financial-risk/
├── RiskChart.tsx
├── helpers.ts          # mix of hooks, fetchers, formatters
├── api.ts              # also has types in it
└── risk-table.tsx
```

**Correct (a consistent mini-app):**

```
src/features/financial-risk/
├── components/         # UI only for this feature
│   ├── risk-chart.tsx
│   └── risk-table.tsx
├── hooks/              # feature-specific hooks
│   └── use-risk-calculations.ts
├── api/                # data access for this domain
│   └── get-risk-data.ts
└── types/              # domain types
    └── index.ts
```

It is fine for `risk-table.tsx` to briefly duplicate logic from another
feature's `positions-table.tsx`. Cohesion within the feature beats early sharing
across features.

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
