---
title: Fetch Reads in the Server Component, Pass Data as Props
impact: HIGH
impactDescription: instant first paint, no client waterfall, no data leak
tags: fetch, rsc, server-components
---

## Fetch Reads in the Server Component, Pass Data as Props

For reads, the **page is the data fetcher**: an `async` Server Component calls
the data-access layer and passes the result down as props. Client components are
presentational. No `useEffect` + `fetch`, no SWR-on-first-load, and no
`'use server'` action used as a read endpoint. This gives instant first paint +
streaming, removes the client fetch waterfall, and keeps data off the client.

**Incorrect (client hook fetches on mount):**

```tsx
'use client'
function ClientsSection() {
  const { data, loading } = useClients() // useEffect + fetch → waterfall, skeleton every load
  if (loading) return <Skeleton />
  return <ClientsTable rows={data ?? []} />
}
```

**Correct (page fetches, table is presentational):**

```tsx
// app/clients/page.tsx
export default async function ClientsPage() {
  const { data, error } = await getClients()
  if (error !== null) return <ErrorState message={`Failed (${error})`} />
  return <ClientsTable rows={data} /> // 'use client', receives props
}
```

Reference: [Next.js — Fetching data on the server](https://nextjs.org/docs/app/getting-started/fetching-data)
