---
title: Global State Is a Last Resort
impact: MEDIUM
impactDescription: a small global surface is easier to reason about
tags: state, global, context, zustand
---

## Global State Is a Last Resort

Context and global stores (Zustand, Redux) are the right tool for a narrow set of
cases: truly global UI (theme, layout toggles, feature flags) and cross-feature
coordination that isn't server data and isn't view state. Reach for them last,
after ruling out server state (`state-server-state`), URL state
(`state-url-state`), and local state (`state-local-ui`). Most "we need global
state" instincts are really one of those three in disguise.

Decision order:

1. Does it come from an API/DB? → server-state layer (RSC / TanStack Query / SWR)
2. Does it describe the current view (filters, sort, page)? → URL search params
3. Is it pure UI for one subtree? → local `useState`
4. Is it truly global UI or cross-feature coordination? → **then** context / a small store

**Incorrect (a global store standing in for server + view state):**

```tsx
const useAppStore = create((set) => ({
  user: null,              // server state → belongs in the data layer
  transactions: [],        // server state → belongs in the data layer
  tableFilters: {},        // view state → belongs in the URL
  theme: "light",          // ✓ genuinely global UI
}));
```

**Correct (the store holds only what's genuinely global):**

```tsx
const useThemeStore = create((set) => ({
  theme: "light",
  toggle: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
}));
```

Reference: [How I Structure Next.js Projects for Scale](https://medium.com/javascript-render/how-i-structure-next-js-projects-for-scale-80646889fd4e)
