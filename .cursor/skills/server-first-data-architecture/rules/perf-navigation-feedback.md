---
title: Show a Top Progress Bar for Navigation Feedback
impact: MEDIUM
impactDescription: the round-trip feels responsive, not frozen
tags: perf, ux, progress-bar
---

## Show a Top Progress Bar for Navigation Feedback

Since navigations and `shallow:false` filter changes incur a server round-trip,
a top progress bar gives the user feedback that something is happening. Watch
out: if the progress package ships **without** a `"use client"` directive,
importing it into the server root layout runs `createContext` on the server and
the build fails — wrap it in a local client component.

**Incorrect (no "use client" on the lib → build error in server layout):**

```tsx
import { ProgressProvider } from '@bprogress/next/app'
// RootLayout (server) renders it → "createContext is not a function"
```

**Correct (local client wrapper):**

```tsx
'use client'
import { ProgressProvider } from '@bprogress/next/app'
export function ProgressBar({ children }: { children: React.ReactNode }) {
  return <ProgressProvider height="3px" color="#702DFF" options={{ showSpinner: false }}>{children}</ProgressProvider>
}
```

Reference: [BProgress](https://bprogress.vercel.app)
