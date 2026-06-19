---
title: Use staleTimes to Make Revisits Instant
impact: MEDIUM
impactDescription: instant back/forward and recently-visited pages
tags: perf, caching, router-cache
---

## Use staleTimes to Make Revisits Instant

Server-first means every navigation is a server round-trip. `experimental
.staleTimes.dynamic` keeps visited **dynamic** pages in the client router cache
for N seconds, so back/forward and revisits within the window render instantly
(no round-trip). The `dynamic` default is `0` (off) since Next 15.

**Incorrect (default — every revisit refetches):**

```ts
// no staleTimes → dynamic pages are never client-cached
const nextConfig = { experimental: {} }
```

**Correct:**

```ts
const nextConfig = {
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
}
```

It doesn't help a *brand-new* filter value (that's genuinely new data) — only
revisits/back-forward.

Reference: [Next.js — staleTimes](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes)
