---
title: Map 403 to forbidden(), Not a Redirect
impact: HIGH
impactDescription: correct 403 status, in place, no redirect loop
tags: auth, forbidden, http
---

## Map 403 to forbidden(), Not a Redirect

When the API denies a request, render an in-place 403 with `forbidden()` rather
than redirecting to a `/forbidden` route. It keeps the URL, returns a real 403,
and avoids redirect loops. Enable `experimental.authInterrupts` and add an
`app/forbidden.tsx`. `forbidden()` works in Server Components / Server Functions
/ Route Handlers — **not** in middleware (middleware can only redirect) and not
in the root layout.

**Incorrect (redirect — wrong status, loop risk for authed users):**

```ts
if (!allowed) redirect('/forbidden?reason=app')
```

**Correct (in-place 403):**

```tsx
// page / layout (Server Component)
const { data, error } = await getThings()
if (error === 403) forbidden() // renders app/forbidden.tsx with a 403
```

```ts
// next.config.ts
experimental: { authInterrupts: true }
```

Authentication (no session → login) stays in middleware; authorization 403s use
`forbidden()`.

Reference: [Next.js — forbidden()](https://nextjs.org/docs/app/api-reference/functions/forbidden)
