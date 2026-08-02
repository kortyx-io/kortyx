---
title: Filters, Sorting, and Pagination Live in the URL
impact: MEDIUM
impactDescription: shareable, restorable views for free
tags: state, url, search-params
---

## Filters, Sorting, and Pagination Live in the URL

State that describes "which view of the data am I looking at" — active filters,
sort column, page number, search query — belongs in URL search params, not in
component state. Putting it in the URL makes views shareable and bookmarkable,
survives refresh and back/forward, and lets Server Components read the params
directly to fetch the right slice. Holding it in `useState` means a refresh
silently resets the user's view.

**Incorrect (view state trapped in the component):**

```tsx
"use client";
function ClientsTable() {
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  // refresh or share → state lost; server can't see it
}
```

**Correct (view state in the URL):**

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";

function ClientsFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const status = params.get("status") ?? "active";

  function setStatus(next: string) {
    const sp = new URLSearchParams(params);
    sp.set("status", next);
    router.push(`?${sp.toString()}`);
  }
  // ...
}
```

```tsx
// the page can now read it server-side
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "active" } = await searchParams;
  const clients = await getClients({ status });
  return <ClientsTable clients={clients} />;
}
```

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
