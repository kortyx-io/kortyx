---
id: v0-studio-exploring-data
title: "Search, filters, and saved views"
description: "Find records with search and filters, save table layouts in your browser, and understand when Studio live updates pause or reconnect."
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

> **Good to know:** Saved views stay in this browser. To share an investigation, use its [run](/docs/studio/runs) or [session](/docs/studio/sessions) URL; recipients still need project access. A help card has its own target, separate from drag, sort, and column-menu controls.

## Live updates

**Live** enables refresh when matching telemetry changes. The indicator distinguishes connecting, live, reconnecting, paused, and off. Reconnection uses periodic refresh as a fallback. Hidden/offline tabs pause updates.

Refresh manually to request current data. Live mode does not bypass filters, recover telemetry the application never sent, or prove that a running execution has finished.

## Contextual help

Use **Explore → Explain this page** for a guided explanation of your current view.
The guide keeps your record and filters in place. [Sample tours and page help](/docs/studio/sample-project#guided-tours-and-page-help) explain how to explore fictional examples when your application has no records yet.

A circled question mark opens a short help card on hover, keyboard focus, or click/tap. Move into the card to use **Read documentation**, which opens the related page/section in a new tab and preserves Studio's current state. Escape dismisses the card. Table header titles and explained state symbols open their own help without an extra question mark. Other compact controls use help circles; roomier setup and empty states can show a documentation button.

Next: [Runs](/docs/studio/runs), [Sessions](/docs/studio/sessions), [Interrupts](/docs/studio/interrupts), or [Metrics](/docs/studio/metrics).
