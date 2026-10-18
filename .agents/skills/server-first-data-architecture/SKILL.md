---
name: server-first-data-architecture
description: Server-first data flow for Next.js App Router apps backed by an HTTP API. Use when deciding how a page should fetch and pass data, where filter/query state lives, how the data-access layer should return errors, how auth/permissions are enforced, or how to structure loading/error/forbidden states. Triggers on "how should this page fetch data", "server action vs hook vs RSC", building a dashboard/list/detail page, URL filters, repository/DAL error handling, hydration mismatches, slow navigation, or "should I check the permission here".
license: MIT
metadata:
  author: Mustafa
  version: "1.0.0"
---

# Server-First Data Architecture (Next.js App Router)

How data flows through an App Router app that sits in front of an HTTP API. The
core principle: **fetch on the server, in the page, and pass data down as
props.** Client components are presentational; the **URL** is the source of
truth for view/filter state; the **backend API** is the source of truth for
authorization.

This composes with `feature-driven-architecture` — that skill says *where code
lives*, this one says *how data moves and fails*.

The litmus test: **a data-backed route is an `async` page that calls a
`Result`-returning data-access function, branches on the result, and renders presentational
children** — no `useEffect` fetching, no read-path server actions, no
`try/catch` in the page, and no permission check duplicated from the API.

> Non-standard / fast-moving Next.js: **verify against ground truth before
> coding** — read `node_modules/next/dist/docs/`, and check a package's real
> API/exports (and whether it ships `"use client"`) before wiring it in. Don't
> trust training data for versions, flags, or APIs.

## When to Apply

- Deciding how a page fetches data, or "server action vs hook vs RSC"
- Designing data-access functions and how they report errors
- Choosing where filter / sort / pagination / month state lives
- Wiring auth: "should I check the permission here?"
- Structuring loading, empty, error, and 403 states for a route
- A Radix/interactive component hydration-mismatches
- Navigation/refetch feels slow and you're tempted to "fix the caching"

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Data Fetching | HIGH | `fetch-` |
| 2 | Data Access Layer | HIGH | `dal-` |
| 3 | Authorization | HIGH | `auth-` |
| 4 | URL State | MEDIUM | `url-` |
| 5 | Page Structure | MEDIUM | `page-` |
| 6 | Perceived Performance | MEDIUM | `perf-` |
| 7 | Resilience | MEDIUM | `resilience-` |

## Quick Reference

### 1. Data Fetching (HIGH)

- `fetch-in-server-component` — Fetch reads in the async page (RSC); pass data as props. No hooks/actions for reads.
- `fetch-parallel-independent` — Fetch independent data with `Promise.all`, not sequential awaits.

### 2. Data Access Layer (HIGH)

- `dal-result-not-throw` — Data-access functions return `Result<T> = { data, error }`; never throw to the page.
- `dal-typed-status-error` — A typed API error carries the HTTP status; `toResult` maps it (else 500).

### 3. Authorization (HIGH)

- `auth-enforce-at-api` — The API is the source of truth; the frontend isn't a security boundary. Forward the user token; don't duplicate per-route checks.
- `auth-forbidden-in-place` — Map a 403 to `forbidden()` (in-place 403), not a redirect.

### 4. URL State (MEDIUM)

- `url-filters-via-nuqs` — Server-affecting state (date/month/page) lives in the URL via nuqs; `shallow:false` re-runs the server fetch. Visual-only state stays local.
- `url-transition-no-flash` — Pass `startTransition` to nuqs so a filter refetch keeps the current UI (dim it) instead of flashing the skeleton.

### 5. Page Structure (MEDIUM)

- `page-single-component-loading` — One async page + sibling `loading.tsx` for the Suspense boundary; early returns for error/empty/data; shared header; single `<main>` in the layout.
- `page-client-for-interactive` — Components rendering interactive client libs (Radix, anything using `useId`) must be `'use client'`, or they hydration-mismatch.
- `page-suspense-per-section` — Independently-fetching sections each get their own `<Suspense>` so they stream in parallel.

### 6. Perceived Performance (MEDIUM)

- `perf-staletimes-revisits` — `experimental.staleTimes.dynamic` keeps visited pages in the client router cache for instant revisits.
- `perf-navigation-feedback` — A top progress bar gives feedback during the unavoidable server round-trip.
- `perf-client-cache-tradeoff` — Server-first ≠ instant navigation; a client query cache (TanStack Query) is the real fix — adopt it when that becomes the priority, reusing the same DAL.

### 7. Resilience (MEDIUM)

- `resilience-degrade-sections` — Degrade a non-critical section to a fallback instead of crashing the route; never swallow a 403 → `forbidden()`.
- `resilience-error-boundaries` — Keep `app/error.tsx` / `app/global-error.tsx` as the last line of defense.
- `resilience-deploy-ordering` — Get a new backend endpoint to production before shipping the frontend that calls it.

## How to Use

Read the individual rule files for rationale plus ❌ incorrect / ✅ correct
examples:

```
rules/fetch-in-server-component.md
rules/dal-result-not-throw.md
rules/auth-enforce-at-api.md
```

See `README.md` and `metadata.json` for sources. Reconcile specifics with the
host repo's `AGENTS.md` before applying.

## Project note

Use the feature architecture skill for placement. In a feature, a server-only
`api/` function is the normal data-access boundary; call it a repository only
when multiple interchangeable data sources make that abstraction useful.
