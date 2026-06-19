---
name: feature-driven-architecture
description: Feature-driven (feature-based) architecture for Next.js App Router projects that need to scale. Use when deciding where new code should live, organizing or refactoring folder structure, reviewing component/hook/data-layer placement, setting feature boundaries, or choosing a state-management approach. Triggers on questions like "where should this go", "how should I structure this feature", "should I extract this to shared", boolean-prop sprawl, fat page.tsx files, or duplicated hooks/utils across the app.
license: MIT
metadata:
  author: Mustafa
  version: "1.0.0"
---

# Next.js Feature-Driven Architecture

How to structure a Next.js (App Router) codebase so it stays fast to navigate,
easy to own, and cheap to refactor as it grows. The core principle: **organize
code by feature / business domain, not by file type.** Technical-layer folders
(`components/`, `hooks/`, `utils/`) scatter one feature across the repo;
feature folders keep it in one place.

The litmus test for a good feature boundary: **if you delete `features/<x>/`,
everything related to `<x>` is gone** — components, hooks, data access, and
types — with no orphaned files hiding in shared folders.

## When to Apply

Reference these guidelines when:

- Deciding where a new component, hook, type, or data call should live
- A `page.tsx` is growing past an entry point into real business logic
- The same component or hook is being copy-pasted across the app
- A component is sprouting boolean props (`isThread`, `isEditing`, …) to flex behavior
- Choosing between local state, URL state, server state, and a global store
- Reviewing a PR for placement, boundaries, or premature abstraction

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Folder Organization | HIGH | `org-` |
| 2 | Feature Boundaries | HIGH | `boundary-` |
| 3 | State Management | MEDIUM | `state-` |
| 4 | Abstraction Timing | MEDIUM | `abstraction-` |

## Quick Reference

### 1. Folder Organization (HIGH)

- `org-group-by-feature` — Group by business domain, not by file type
- `org-thin-routes` — Keep `app/` for routing/layouts only; delegate to a feature
- `org-feature-internals` — Each feature is a mini-app: `components/ hooks/ api/ types/`
- `org-design-system-only` — `components/` holds shared UI with zero domain knowledge

### 2. Feature Boundaries (HIGH)

- `boundary-no-cross-feature-imports` — Don't import sibling features; compose them at the app level
- `boundary-unidirectional-deps` — Dependencies flow one way: `shared → features → app`
- `boundary-public-api` — Expose a deliberate public surface per feature (mind the barrel trade-off)
- `boundary-no-deep-imports` — Import a feature's public API, never its internals
- `boundary-deletable` — A feature must be removable by deleting one folder

### 3. State Management (MEDIUM)

- `state-server-state` — Server data belongs in a server-state layer (RSC fetch / TanStack Query / SWR), not global stores
- `state-url-state` — Filters, sorting, and pagination live in URL search params
- `state-local-ui` — Pure UI concerns use local `useState` in the nearest component
- `state-global-last-resort` — Reach for context / a global store only for truly global, cross-feature UI

### 4. Abstraction Timing (MEDIUM)

- `abstraction-rule-of-two` — Don't promote code to `components/` until two features use it
- `abstraction-colocate-tests` — Tests live next to the code they cover

## How to Use

Read individual rule files for the rationale plus incorrect/correct examples:

```
rules/org-group-by-feature.md
rules/boundary-public-api.md
```

Each rule file contains a short explanation, an ❌ incorrect example, a ✅
correct example, and references. For source articles and the broader
methodologies this draws on, see the README and `metadata.json`.

## Project note

This repository does **not** currently use this layout — it uses layered/DDD
modules (`lib/hiring/{domain,application,infrastructure}`) plus Atomic Design
components (`atoms/ molecules/ organisms/`), and React Server Components with
`use cache` rather than TanStack Query. Treat this skill as a general guide for
greenfield Next.js apps or for the principles (thin routes, clear boundaries,
server-first state, late abstraction), and reconcile specifics with the
conventions already in `AGENTS.md` before applying it here. See
`boundary-public-api` for how feature barrel files interact with the
`bundle-barrel-imports` performance rule.
