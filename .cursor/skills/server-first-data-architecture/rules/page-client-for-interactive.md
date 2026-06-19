---
title: Interactive Client Libraries Must Be "use client"
impact: MEDIUM
impactDescription: prevents Radix/useId hydration mismatches
tags: page, hydration, use-client, radix
---

## Interactive Client Libraries Must Be "use client"

A **Server Component that renders an interactive client library** (Radix
tooltips/popovers, anything using `useId` or context) hydration-mismatches —
the SSR'd `useId`/Slot diverges from the client render. Mark the component
`'use client'` so the whole interactive subtree renders as one cohesive client
tree. Rule of thumb: if every other Tooltip/Popover component is `'use client'`
and one isn't, the odd one out is your hydration bug.

**Incorrect (server component renders Radix Tooltip → hydration error):**

```tsx
// no 'use client'
export function HighlightsPanel({ data }) {
  return <Tooltip>{/* Radix → useId mismatch on hydration */}</Tooltip>
}
```

**Correct (client boundary):**

```tsx
'use client'
export function HighlightsPanel({ data }) {
  return <Tooltip>{/* renders consistently SSR + client */}</Tooltip>
}
```

It still receives server-fetched `data` as props — `'use client'` is about
rendering, not data ownership.

Reference: [React — hydration mismatch](https://react.dev/link/hydration-mismatch)
