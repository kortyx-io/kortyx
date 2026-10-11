---
title: Fetch Independent Data in Parallel
impact: HIGH
impactDescription: wall-clock = slowest call, not the sum
tags: fetch, performance, promise-all
---

## Fetch Independent Data in Parallel

When a page needs several independent pieces of data, kick them off together
with `Promise.all` rather than awaiting one after another — sequential awaits
make the page as slow as the sum of every call.

**Incorrect (sequential — waterfall):**

```tsx
const revenue = await getRevenue({ month })
const clients = await getClients() // waits for revenue first, for no reason
```

**Correct (parallel):**

```tsx
const [revenue, clients] = await Promise.all([
  getRevenue({ month }),
  getClients(),
])
```

For a critical + best-effort mix, still fire them together and branch per
result (the critical one drives the page; degrade the rest — see
`resilience-degrade-sections`).

Reference: [Next.js — Parallel data fetching](https://nextjs.org/docs/app/getting-started/fetching-data#parallel-data-fetching)
