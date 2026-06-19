---
title: Carry the HTTP Status on a Typed Error
impact: HIGH
impactDescription: lets the page branch on 403 vs other failures
tags: dal, error-handling, http
---

## Carry the HTTP Status on a Typed Error

The HTTP client throws a typed error that carries `status`, so `toResult` can
map it to a meaningful `error` code (and the page can distinguish 403 from a
generic failure). Don't throw bare `Error("request failed")` — the status is
lost and everything collapses to 500.

**Incorrect (status lost):**

```ts
if (!res.ok) throw new Error(`request failed: ${res.status}`) // status only in a string
```

**Correct (typed, status preserved):**

```ts
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

if (!res.ok) {
  throw new ApiError(res.status, `${path} responded ${res.status}`)
}
```

`ApiError extends Error`, so existing `err.message` readers keep working;
`toResult` reads `err.status`.

Reference: [MDN — HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
