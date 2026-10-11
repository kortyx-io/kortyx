---
title: Server-Affecting State Lives in the URL (nuqs)
impact: MEDIUM
impactDescription: shareable views; server reads them directly
tags: url, nuqs, state, search-params
---

## Server-Affecting State Lives in the URL (nuqs)

Anything that changes **what the server returns** — date range, month, page,
search — is URL state: read on the server from `searchParams`, written on the
client with `nuqs`. Use `shallow: false` so the change re-runs the Server
Component and refetches. Purely-visual state (sort, open menus, client-side tag
filters over already-loaded rows) stays in local `useState`. Mount
`<NuqsAdapter>` once in the root layout. Bonus: filtered views are shareable and
bookmarkable.

**Incorrect (filter trapped in client state → server never sees it):**

```tsx
const [from, setFrom] = useState('') // refresh/share loses it; no refetch
```

**Correct (URL state, server refetches):**

```tsx
'use client'
import { parseAsString, useQueryStates } from 'nuqs'

const [, setRange] = useQueryStates(
  { from: parseAsString, to: parseAsString },
  { shallow: false }, // re-runs the Server Component
)
// apply: setRange({ from: from || null, to: to || null })
```

```tsx
// page reads it server-side
export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams
  const { data, error } = await getThings({ from })
  // ...
}
```

Reference: [nuqs documentation](https://nuqs.47ng.com)
