---
title: The Rule of Two — Don't Share Until Two Features Use It
impact: MEDIUM
impactDescription: avoids premature, wrong abstractions
tags: abstraction, sharing, duplication
---

## The Rule of Two — Don't Share Until Two Features Use It

Don't promote a component, hook, or util into `components/` or a shared module
the first time you write it. Keep it inside the feature — even if it looks
generic — until a **second** feature genuinely needs the same behavior.
Premature sharing produces an abstraction shaped by a single use case; the second
caller then bends it with options and booleans until it becomes a God component
nobody dares touch. A little duplication is cheaper than the wrong abstraction.

**Incorrect (extracted on first use, then warped to fit two callers):**

```tsx
// components/data-table.tsx — "shared" after one use, now a config monster
<DataTable
  columns={cols}
  withRowSelection
  withInlineEdit
  isInvoiceMode          // leaked from caller #1
  riskHeatmap            // leaked from caller #2
  exportFormat="csv"
/>
```

**Correct (duplicate first; extract once the pattern is proven):**

```tsx
// features/invoices/components/invoice-table.tsx
// features/financial-risk/components/risk-table.tsx
// Both start as small, separate tables. Only after a real third use of the
// SAME behavior do you extract components/data-table.tsx with an API informed
// by all the concrete cases.
```

When you do extract, design the shared API from the multiple real usages you now
have — not from a guess.

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
