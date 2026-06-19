---
title: Independently-Fetching Sections Get Their Own Suspense
impact: MEDIUM
impactDescription: parallel streaming; stable useId per section
tags: page, suspense, streaming
---

## Independently-Fetching Sections Get Their Own Suspense

When a page composes several sections that each fetch their own data, wrap each
async section in its **own** `<Suspense>`. They then stream in parallel (a slow
section doesn't block the others), and each subtree keeps a stable boundary —
which also avoids `useId` drift in interactive children under partial
prerendering.

**Incorrect (one async section inline, no boundary):**

```tsx
return (
  <>
    <PageHeader />
    <PriorityHighlightsSection /> {/* async, unbounded → blocks / id drift */}
    <RevenueDashboard data={revenue} />
  </>
)
```

**Correct (own boundary per streamed section):**

```tsx
return (
  <>
    <PageHeader />
    <Suspense fallback={<LoadingSkeleton />}>
      <PriorityHighlightsSection /> {/* fetches itself, streams independently */}
    </Suspense>
    <RevenueDashboard data={revenue} />
  </>
)
```

Reference: [Next.js — Streaming with Suspense](https://nextjs.org/docs/app/getting-started/fetching-data#streaming)
