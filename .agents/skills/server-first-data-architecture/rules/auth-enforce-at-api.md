---
title: Enforce Authorization at the API, Not the Frontend
impact: HIGH
impactDescription: one source of truth; no drift; faster (read session once)
tags: auth, security, permissions
---

## Enforce Authorization at the API, Not the Frontend

The frontend is **not a security boundary** — a direct API call bypasses
anything checked here. So authorization lives at the API (the data owner): the
app **forwards the user's token**, the API enforces the per-resource permission
and returns **403**, which the DAL surfaces and the page turns into
`forbidden()`. Don't duplicate per-route permission checks in the frontend —
it's drift-prone and still isn't the real guard. A single coarse app-entry gate
(in a layout) is fine; everything else is the API's job. Keep a permissions
catalog only for optimistic UI (hiding nav), never as enforcement.

**Incorrect (frontend re-checks; redundant, not a boundary):**

```ts
export async function getThings() {
  await requirePermission('things:view') // duplicate of the API check; bypassable
  return queryThings()
}
```

**Correct (forward the user token; the API decides):**

```ts
async function fetchThings(token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new ApiError(res.status, '...') // 403 → page calls forbidden()
  return res.json()
}
```

Caveat: this holds **because you forward the user token**. If you switch to a
service/master token, the API authorizes the service, not the user, and you'd
need per-user authz elsewhere.

Reference: [Next.js — Authorization](https://nextjs.org/docs/app/guides/authentication#authorization)
