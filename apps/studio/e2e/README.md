# Studio detail drawer E2E architecture

This suite is the executable handoff for KTX-25, KTX-17, and KTX-18. Read this file
before changing the detail stack, parallel-route slots, nested inspectors,
history behavior, payload controls, or portalled overlays.

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
Projected child Runs use `call:` IDs, so cleanup also matches their parent's
reserved prefix. Never broaden cleanup to non-fixture parents.

`support/navigation-fixture.ts` adds opaque IDs and suspended calls in two
branches through the same ingestion API and reserved cleanup prefix.

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
- `data-payload-viewer`, `data-mode`, `data-clean`, and `data-wrap` expose
  payload presentation state while actions remain accessible by role and name.

Prefer accessible roles and names for user actions. Use these attributes only
for state or identity that accessibility semantics cannot distinguish.

Assert relational geometry (for example, expanded drawer left edge equals the
sidebar inset edge), not screenshot pixels. Use Playwright auto-waiting,
web-first assertions, or `expect.poll`; do not add fixed sleeps.

For transient animation states, install the browser audit before the action.
Drain queued entry animation events before observing close, then assert the
captured state and selection at exit completion. A runner may receive a click
response after Presence has already removed the closing surface.

## Regressions this suite must keep failing on

- colon, URL delimiter, Unicode, or literal percent escapes in an opaque entity
  ID cause a wrong lookup, a 404, or a different drawer identity;
- Run → Session → Run or Session → Run → Session changes the URL while leaving
  the destination hidden under a retained descendant;
- a selected workflow call links to another branch or invocation's interrupt;
- an Interrupt breadcrumb returns to a retained Run without selecting the
  requested call and branch;
- an Interrupt table's Run link reloads the document or drops the list filters;
- modified entity clicks close retained ancestors in the original tab;
- loading and resolved slots create two drawer surfaces;
- a list row opens a full route or skips its entry motion;
- the first Session → Run navigation replaces the stack with a standalone
  route after loading (production link prefetching);
- Browser Back removes a drawer before its exit state is observable;
- the backdrop disappears between layers or closes more than one layer;
- the backdrop sits above ancestor drawers and blocks their visible slivers;
- Trace/Event selection history reopens Run during an intentional close;
- reopening the same Trace remounts its portal or replays its exit animation;
- a tab change unmounts the inspector before its exit motion finishes;
- closing a child shrinks an expanded Run;
- `detailView=expanded` affects an ancestor instead of only the active layer;
- an expanded detail keeps the modal backdrop over the sidebar;
- a direct hard refresh renders drawer presentation instead of route
  presentation.
- a dropdown or tooltip portal renders below its owning drawer or inspector;
- payload representation, clean/raw, wrap, copy, Escape, or outside dismissal
  stops working in a route, drawer, or nested inspector;
- a query-only detail tab change duplicates a full-page detail as an
  intercepting drawer.
- live mode polls every browser on a fixed interval instead of consuming
  project-scoped invalidations;
- a committed telemetry batch does not appear without a manual refresh;
- live refresh loses the active filters, pagination URL, drawer, or table
  scroll state.

If a failure reveals a new regression class, add the scenario here and to the
relevant hardening ticket before changing the implementation.

## Development and production checks

Run the full development suite with `pnpm test:studio:e2e`. CI also runs
`internal-linking.spec.ts` and `detail-drawer-stack.spec.ts` with
`KORTYX_E2E_PRODUCTION=1` so Next's built routes and intercepted navigation
remain covered. After preparing dependencies and the database, run that check
locally with:

```sh
KORTYX_E2E_PRODUCTION=1 pnpm --filter kortyx-studio exec dotenv -e ../../.env -- \
  playwright test internal-linking.spec.ts detail-drawer-stack.spec.ts
```
