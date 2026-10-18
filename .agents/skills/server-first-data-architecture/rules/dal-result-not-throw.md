---
title: Data-Access Functions Return a Result, Never Throw to the Page
impact: HIGH
impactDescription: no unhandled crashes; uniform error/403 handling
tags: dal, result, error-handling, typescript
---

## Data-Access Functions Return a Result, Never Throw to the Page

Data-access functions return a discriminated `Result<T> = { data, error }`
instead of throwing. Errors become data the page branches on — no `try/catch`
in pages, no unhandled exception white-screening the route, and 403 handling
becomes uniform. `error` is the upstream HTTP status (or 500); on success it's
`null` and `data` narrows to non-null.

**Incorrect (throws; page must wrap and can crash):**

```ts
export async function getThings(): Promise<Thing[]> {
  return queryThings() // throws on any non-2xx → caller must try/catch or crash
}
```

**Correct (Result):**

```ts
export type Result<T> = { data: T; error: null } | { data: null; error: number }

export async function toResult<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await run(), error: null }
  } catch (err) {
    return { data: null, error: err instanceof ApiError ? err.status : 500 }
  }
}

export function getThings(): Promise<Result<Thing[]>> {
  return toResult(() => queryThings())
}
```

```tsx
const { data, error } = await getThings()
if (error === 403) forbidden()
if (error !== null) return <ErrorState message={`Failed (${error})`} />
// data is Thing[] here
```

Reference: [Next.js — Data Access Layer](https://nextjs.org/docs/app/guides/authentication#creating-a-data-access-layer-dal)
