---
title: Use Zod Schemas as the Single Source of Truth
impact: HIGH
impactDescription: runtime validation and TypeScript types cannot drift
tags: schemas, zod, types, validation
---

## Use Zod Schemas as the Single Source of Truth

When a feature needs a data contract, define it with Zod and infer TypeScript
types from that schema. Do not maintain a parallel interface/type definition
for the same shape.

Start with `schema.ts`. Split into `schema/` only when multiple schemas make a
single file hard to navigate. Validate untrusted external data at the `api/`
boundary with the schema before it reaches the feature.

```ts
import { z } from "zod";

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;
```

This is a feature-local convention. Promote a schema only when it is a real,
stable contract shared by independent features.
