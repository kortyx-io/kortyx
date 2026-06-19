---
title: Degrade Non-Critical Sections, Never Swallow a 403
impact: MEDIUM
impactDescription: a widget failure can't take down the route
tags: resilience, error-handling, degradation
---

## Degrade Non-Critical Sections, Never Swallow a 403

A single non-critical section's data failure must not crash the whole route.
Branch on its `Result` and render a fallback ("unavailable") for that widget
while the rest of the page renders. The hard rule: **never swallow a 403** —
authorization failures must still surface `forbidden()`, not be treated as a
best-effort outage.

**Incorrect (one failure crashes the route; or 403 hidden):**

```tsx
const gaps = await getRecruiterGaps() // throws → whole page errors
// or: gaps.error ? null : gaps.data  → also hides a 403 as "unavailable"
```

**Correct (degrade non-auth errors, surface 403):**

```tsx
const [clients, gaps] = await Promise.all([getClients(), getRecruiterGaps()])
if (clients.error === 403 || gaps.error === 403) forbidden() // never swallowed
return (
  <Panel
    clients={clients.data ?? []}
    gaps={gaps.error !== null ? null : gaps.data} // newer endpoint may be down → degrade
  />
)
```

Reference: [Next.js — Error Handling](https://nextjs.org/docs/app/getting-started/error-handling)
