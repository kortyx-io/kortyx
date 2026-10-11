---
title: Keep app/ Thin — Routes, Not Business Logic
impact: HIGH
impactDescription: keeps the routing layer a stable, swappable shell
tags: organization, app-router, routing
---

## Keep app/ Thin — Routes, Not Business Logic

The App Router is for URL structure, layouts, and data-fetching boundaries — not
for component logic. A `page.tsx` should be an entry point that hands off almost
immediately to a feature. When pages carry state, effects, and transformations,
the URL structure and the business logic become coupled, and every product pivot
forces a routing refactor.

**Incorrect (a fat route file):**

```tsx
// app/dashboard/page.tsx
"use client";
export default function DashboardPage() {
  const [range, setRange] = useState("30d");
  const { data } = useQuery({ queryKey: ["metrics", range], queryFn: fetchMetrics });
  // ...50+ more lines of state, effects, and transformation mixed with JSX
  return <div>{/* ... */}</div>;
}
```

**Correct (delegate to a feature):**

```tsx
// app/dashboard/page.tsx
import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";

export default function DashboardPage() {
  return <DashboardOverview />;
}
```

The route maps a URL to a feature; all behavior lives in
`features/dashboard/`. Refactors stay inside the feature and never touch routing.

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
