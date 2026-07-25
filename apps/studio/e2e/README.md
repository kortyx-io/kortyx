# Studio detail drawer E2E architecture

This suite is the executable handoff for KTX-25. Read this file before changing
the detail stack, parallel-route slots, nested inspectors, or history behavior.

## Why browser coverage is required

The drawer stack crosses Next.js intercepting routes, parallel-route loading
boundaries, Nuqs query history, retained React trees, Radix portals, CSS motion,
and the browser history API. Unit tests in
`src/components/detail/detail-stack-state.test.ts` protect pure array
transitions, but they cannot detect mount gaps, blocked hit targets, lost exit
animations, or Back/Forward timing.

## Fixture boundary

`support/telemetry-fixture.ts` creates one Session, Run, and resolved Interrupt
through the public telemetry ingestion API. IDs use the reserved
`e2e-ktx25-*` prefix. Setup removes stale copies first; teardown deletes only
that prefix from `studio_interrupts`, `studio_runs`, `studio_sessions`,
`telemetry_events`, and the dedicated workflow revision.

Never replace the fixture with hard-coded local database rows. Going through
ingestion keeps Studio projections, API contracts, and detail routes in the
test boundary.

## Stable assertions

- `data-row-key` identifies a shared table row without depending on column
  order or visible text.
- `data-table-ready="true"` means the server-rendered table is hydrated and
  interactive.
- `data-detail-drawer="<pathname>"`, `data-state`, and `data-entry-motion`
  expose drawer identity and transition state.
- `data-detail-inspector` identifies the nested Trace/Event surface.
- `data-detail-backdrop` exposes the one persistent stack backdrop.

Prefer accessible roles and names for user actions. Use these attributes only
for state or identity that accessibility semantics cannot distinguish.

Assert relational geometry (for example, expanded drawer left edge equals the
sidebar inset edge), not screenshot pixels. Use Playwright auto-waiting,
web-first assertions, or `expect.poll`; do not add fixed sleeps.

## Regressions this suite must keep failing on

- loading and resolved slots create two drawer surfaces;
- a list row opens a full route or skips its entry motion;
- Browser Back removes a drawer before its exit state is observable;
- the backdrop disappears between layers or closes more than one layer;
- the backdrop sits above ancestor drawers and blocks their visible slivers;
- Trace/Event selection history reopens Run during an intentional close;
- a tab change unmounts the inspector before its exit motion finishes;
- closing a child shrinks an expanded Run;
- `detailView=expanded` affects an ancestor instead of only the active layer;
- an expanded detail keeps the modal backdrop over the sidebar;
- a direct hard refresh renders drawer presentation instead of route
  presentation.

If a failure reveals a new regression class, add the scenario here and to the
KTX-25 ticket before changing the implementation.
