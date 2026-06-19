---
title: Group by Feature, Not by File Type
impact: HIGH
impactDescription: the foundation of a scalable layout
tags: organization, features, structure
---

## Group by Feature, Not by File Type

Organize code by the business domain it serves, not by its technical kind.
Technical-layer folders (`components/`, `hooks/`, `services/`, `utils/`) feel
fine on day one, but as the app grows you end up jumping across 3–5 folders to
change one feature, and a single domain's API calls, components, and types drift
apart. Feature folders keep everything for one domain together, so the code maps
directly onto how the product is described.

The boundary test: deleting `features/invoices/` should remove **everything**
about invoices — UI, hooks, data access, and types — with nothing left behind.

**Incorrect (one feature scattered across technical folders):**

```
src/
├── components/
│   ├── invoice-table.tsx        # invoices
│   └── risk-chart.tsx           # financial-risk
├── hooks/
│   ├── use-invoices.ts          # invoices
│   └── use-risk.ts              # financial-risk
├── services/
│   ├── invoices.ts              # invoices
│   └── risk.ts                  # financial-risk
└── types/
    └── index.ts                 # everything, all mixed
```

**Correct (each feature owns its slice):**

```
src/features/
├── invoices/
│   ├── components/invoice-table.tsx
│   ├── hooks/use-invoices.ts
│   ├── api/get-invoices.ts
│   └── types/index.ts
└── financial-risk/
    ├── components/risk-chart.tsx
    ├── hooks/use-risk.ts
    ├── api/get-risk-data.ts
    └── types/index.ts
```

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
