---
title: Server-First Isn't Instant Navigation — Add a Client Cache When It Matters
impact: MEDIUM
impactDescription: sets honest expectations; clean upgrade path
tags: perf, tanstack-query, swr, tradeoff
---

## Server-First Isn't Instant Navigation — Add a Client Cache When It Matters

Be honest about the ceiling: caching data on the **server** (`use cache`) speeds
the response, not the browser→server round-trip. So navigation still shows a
delay. True "show cached data instantly, revalidate in the background" is a
**client** stale-while-revalidate pattern (TanStack Query / SWR), not a server
one. Don't claim `use cache` alone solves it.

Adopt a client query cache when instant navigation becomes the priority — and
it's an **additive, incremental** change, because this architecture is the right
base:

- The `Result` repos become the `queryFn` (reused as-is).
- Keep the **server prefetch** for first paint (so `forbidden()` and SEO
  survive); use TanStack for the cache + revalidation, not as a replacement.
- nuqs filter params become the **query key**.
- The one shift: TanStack wants the `queryFn` to **throw**, and `forbidden()` is
  server-only — so client-side revalidation handles 403 in-component, while the
  server prefetch keeps the in-place 403 on first load.

Reference: [TanStack Query — Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
