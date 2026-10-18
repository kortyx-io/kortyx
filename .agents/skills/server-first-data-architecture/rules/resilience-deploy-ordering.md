---
title: Ship the Backend Endpoint to Production Before the Frontend
impact: MEDIUM
impactDescription: avoids a frontend that 404s in prod
tags: resilience, deployment, release-ordering
---

## Ship the Backend Endpoint to Production Before the Frontend

When a frontend change depends on a new backend endpoint, get the **API to
production first**, then ship the frontend. "Merged to main" is not "in
production" if the two repos release differently (e.g. frontend auto-deploys on
merge, backend deploys on a tagged release). A frontend calling an endpoint
that's only on staging will 404 in prod.

**Incorrect (frontend first → prod fetch 404s):**

```
1. merge + deploy frontend that calls /new-endpoint
2. backend /new-endpoint still only on staging → 404 in prod
```

**Correct (API in prod, then frontend):**

```
1. merge backend PR AND release it to production; confirm the endpoint is live
2. only then merge/deploy the frontend
```

Pair with `resilience-degrade-sections` so that even if ordering slips, a
missing endpoint degrades one widget instead of taking down the route.

Reference: [Next.js — Deploying](https://nextjs.org/docs/app/getting-started/deploying)
