---
title: Map Data at the Boundary
impact: MEDIUM
impactDescription: external and presentation shapes do not leak through a feature
tags: boundaries, mapping, api, presentation
---

## Map Data at the Boundary

Do not create a generic mapper layer preemptively. Add a mapper where it
protects a real boundary:

- external payload → canonical feature data: colocate with the feature's
  `api/` adapter;
- canonical feature data → library or view-specific shape: use a pure function
  in feature-local `lib/`.

If the source already matches the canonical schema, no mapper is needed.

```text
HTTP/DB/SDK payload → api/to-workflow.ts → Workflow schema → lib/workflow-graph.ts → React Flow
```

Keep these functions feature-local until a second independent feature proves a
shared abstraction is needed.
