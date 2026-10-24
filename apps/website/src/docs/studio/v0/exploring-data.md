---
id: v0-studio-exploring-data
title: "Search, filters, and saved views"
description: "Find records with search and filters, save table layouts and named views, and understand when Studio live updates pause or reconnect."
keywords: [kortyx, studio, guides]
sidebar_label: "Search, filters, and saved views"
section: "reference"
---
# Search, filters, and saved views

These controls work across Cloud and self-hosted Studio. Select the intended project before filtering its data.

## Search and filters

Search narrows the current list. Filters expose supported fields and operators; **All** requires every condition and **Any** accepts any condition. Time range and environment also narrow the available evidence.

Environment is an informational label supplied by your application. It is not a project, a separate authorization boundary, or proof of a deployment. Use the exact label your server emits.

Runs defaults to root executions. **Include child workflows** exposes individual child calls; it does not change session root-run counts.

Filter state is represented in the URL where supported, so sharing a URL can preserve the investigation's conditions. Recipients still need their own authorized access. If no rows match, clear filters and expand the time range before diagnosing ingestion.

## Table views

Drag a header to reorder columns; drag its resize handle to change width. Use the column menu to pin, hide, reset a width, or restore the layout. Hover or focus the header title for its explanation; use the sorting control to change order.

Use **Views** to save filters, search, sorting, page size, and layout. Cloud views belong to your signed-in user within the selected project. Self-hosted Studio shares one profile per project; saving it requires project write access. Layout and default sort/page size save automatically; current search and filters save only in a named view.

The browser cache loads immediately, then authenticated Studio refreshes it from the database in the background. Page loading does not wait for saved preferences. If **Preferences not saved** appears, use **Retry** after a request failure, **Save my changes** to apply your edits over the latest saved preferences, or **Reload preferences** to discard pending edits. Other users' changes are never silently overwritten. Sample-project and unauthenticated development choices stay in a separate browser cache; if project identity is unavailable, choices remain in the current tab.

Existing browser-only views are not uploaded. Up to 30 named views can be saved per table. To share an investigation, use its [run](/docs/studio/runs) or [session](/docs/studio/sessions) URL; recipients still need project access. A help card has its own target, separate from drag, sort, and column-menu controls.

## Live updates

**Live** enables refresh when matching telemetry changes. The indicator distinguishes connecting, live, reconnecting, paused, and off. Reconnection uses periodic refresh as a fallback. Hidden/offline tabs pause updates.

Refresh manually to request current data. Live mode does not bypass filters, recover telemetry the application never sent, or prove that a running execution has finished.

## Contextual help

Use **Explore → Explain this page** for a guided explanation of your current view.
The guide keeps your record and filters in place. [Sample tours and page help](/docs/studio/sample-project#guided-tours-and-page-help) explain how to explore fictional examples when your application has no records yet.

A circled question mark opens a short help card on hover, keyboard focus, or click/tap. Move into the card to use **Read documentation**, which opens the related page/section in a new tab and preserves Studio's current state. Escape dismisses the card. Table headers show a help circle to the left of the column menu on hover or keyboard focus. These buttons overlay the label area without changing its width. Click the label to sort; use the help circle for its explanation. Explained state symbols open their own help. Other compact controls use help circles; roomier setup and empty states can show a documentation button.

Opening another tooltip closes the previous card, including a card pinned by a click. Header help prefers the space above its help circle and moves below when there is not enough room.

Next: [Runs](/docs/studio/runs), [Sessions](/docs/studio/sessions), [Interrupts](/docs/studio/interrupts), or [Metrics](/docs/studio/metrics).
