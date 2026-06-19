---
title: Server Data Belongs in a Server-State Layer
impact: MEDIUM
impactDescription: removes whole classes of cache/stale bugs
tags: state, data-fetching, server-state
---

## Server Data Belongs in a Server-State Layer

The most common state mistake is pushing data that lives on the server into a
global client store (Redux, Zustand, context) and then hand-rolling loading,
caching, and invalidation. Data that comes from an API or DB is **server state**
and should be handled by a tool built for it — React Server Components fetching
directly, or a client cache like TanStack Query / SWR — which give you caching,
deduplication, and revalidation for free.

**Incorrect (server data manually shoved into global state):**

```tsx
const useStore = create((set) => ({
  transactions: [],
  loading: false,
  fetchTransactions: async () => {
    set({ loading: true });
    const res = await fetch("/api/transactions");
    set({ transactions: await res.json(), loading: false }); // no cache, no dedup, manual invalidation
  },
}));
```

**Correct (a server-state layer owns it):**

```tsx
// client cache option
const { data, isLoading } = useQuery({
  queryKey: ["transactions"],
  queryFn: getTransactions,
});
```

```tsx
// React Server Component option (this repo's approach — see use cache)
export async function TransactionList() {
  const transactions = await getTransactions();
  return <ul>{transactions.map((t) => <TransactionItem key={t.id} transaction={t} />)}</ul>;
}
```

Keep the global store for genuinely client-only, cross-feature state (see
`state-global-last-resort`).

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
