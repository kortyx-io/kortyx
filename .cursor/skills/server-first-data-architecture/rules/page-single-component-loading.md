---
title: Single Async Page + loading.tsx + Early Returns
impact: MEDIUM
impactDescription: instant header shell; one place per state
tags: page, loading, suspense, structure
---

## Single Async Page + loading.tsx + Early Returns

A data-backed route is **one** async page component. The Suspense boundary its
dynamic `searchParams`/fetch needs comes from a sibling `loading.tsx`, not an
inner wrapper component. Branch states with early returns
(`forbidden()` → error → empty → data), each rendering the same shared header;
keep the single `<main>` in the root layout.

**Incorrect (inner data component + in-page Suspense + nested ternary):**

```tsx
export default function Page() {
  return <Suspense fallback={<Skeleton/>}><Data /></Suspense> // extra layer
}
async function Data() { /* error ? ... : empty ? ... : ... */ }
```

**Correct (single component, loading.tsx, early returns):**

```tsx
// app/<route>/page.tsx
export default async function Page({ searchParams }) {
  const { data, error } = await getThings(await searchParams)
  if (error === 403) forbidden()
  if (error !== null) return <><PageHeader/><ErrorState message={`(${error})`} /></>
  if (data.length === 0) return <><PageHeader/><EmptyState /></>
  return <><PageHeader/><ThingsTable rows={data} /></>
}
// app/<route>/loading.tsx → <><PageHeader/><LoadingSkeleton/></>
```

Reference: [Next.js — loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading)
