---
title: Keep Route Error Boundaries as the Last Line of Defense
impact: MEDIUM
impactDescription: contained error UI instead of a white-screen 500
tags: resilience, error-boundary
---

## Keep Route Error Boundaries as the Last Line of Defense

`app/error.tsx` and `app/global-error.tsx` catch uncaught render errors so a bug
shows a contained error UI, not a blank 500. They complement (don't replace)
the `Result` branching — the DAL handles *expected* failures gracefully; the
boundary catches the *unexpected* ones.

**Incorrect (no boundary → uncaught error white-screens the app):**

```
app/
  page.tsx   # an unexpected throw here → blank 500
```

**Correct (boundaries present):**

```tsx
// app/error.tsx
'use client'
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState onRetry={reset} />
}
// app/global-error.tsx — wraps the root <html>/<body> for layout-level crashes
```

Reference: [Next.js — error.js](https://nextjs.org/docs/app/api-reference/file-conventions/error)
